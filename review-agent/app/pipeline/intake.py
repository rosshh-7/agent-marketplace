import json
import re
import shutil
import tarfile
import tempfile
import zipfile
from pathlib import Path

from app.config import DEFAULT_ENTRYPOINT_NAME, PROMPTS_FILENAME, REQUIRED_ROOT_FILES
from app.pipeline.state import Finding, ReviewState


def _safe_extract_tar(tar: tarfile.TarFile, dest: Path) -> None:
    dest_resolved = dest.resolve()
    for member in tar.getmembers():
        member_path = (dest / member.name).resolve()
        if not str(member_path).startswith(str(dest_resolved) + "/") and member_path != dest_resolved:
            raise ValueError(f"unsafe path traversal in tarball member: {member.name}")
    tar.extractall(dest, filter="data")


def _safe_extract_zip(zf: zipfile.ZipFile, dest: Path) -> None:
    dest_resolved = dest.resolve()
    for name in zf.namelist():
        member_path = (dest / name).resolve()
        if not str(member_path).startswith(str(dest_resolved) + "/") and member_path != dest_resolved:
            raise ValueError(f"unsafe path traversal in zip member: {name}")
    zf.extractall(dest)


def extract_submission(tarball_path: str, workdir: Path) -> None:
    path = Path(tarball_path)
    if path.suffixes[-2:] == [".tar", ".gz"] or path.suffix == ".tgz":
        with tarfile.open(path, "r:gz") as tar:
            _safe_extract_tar(tar, workdir)
    elif path.suffix == ".tar":
        with tarfile.open(path, "r:") as tar:
            _safe_extract_tar(tar, workdir)
    elif path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            _safe_extract_zip(zf, workdir)
    else:
        raise ValueError(f"unsupported submission archive type: {path.suffix}")

    _strip_archive_metadata(workdir)

    # Sellers sometimes wrap their project in a single top-level directory
    # (e.g. my-agent/agent.py). Flatten one level if that's the only thing extracted.
    entries = list(workdir.iterdir())
    if len(entries) == 1 and entries[0].is_dir():
        inner = entries[0]
        for item in inner.iterdir():
            shutil.move(str(item), str(workdir / item.name))
        inner.rmdir()


def _strip_archive_metadata(workdir: Path) -> None:
    """Remove macOS archive cruft (AppleDouble ._files, __MACOSX/) so it never reaches
    static analysis or the Docker build context — it isn't real submitted source."""
    macosx_dir = workdir / "__MACOSX"
    if macosx_dir.exists():
        shutil.rmtree(macosx_dir)
    for path in workdir.rglob("._*"):
        if path.is_file():
            path.unlink()


def _dockerfile_entrypoint_filename(dockerfile_text: str) -> str | None:
    """Best-effort extraction of the .py filename from CMD/ENTRYPOINT. Handles both the
    JSON-array form (CMD ["python", "main.py"]) and the shell form (CMD python main.py)."""
    for match in re.finditer(r"^\s*(?:CMD|ENTRYPOINT)\s+(.*)$", dockerfile_text, re.MULTILINE):
        rest = match.group(1).strip()
        tokens: list[str] = []
        if rest.startswith("["):
            try:
                tokens = json.loads(rest)
            except json.JSONDecodeError:
                tokens = re.findall(r'"([^"]+)"', rest)
        else:
            tokens = rest.split()
        for token in reversed(tokens):
            if token.endswith(".py"):
                return Path(token).name
    return None


def _discover_file(workdir: Path, filename: str) -> Path | None:
    matches = sorted(workdir.rglob(filename), key=lambda p: len(p.relative_to(workdir).parts))
    return matches[0] if matches else None


def _discover_entrypoint(workdir: Path) -> Path | None:
    dockerfile = workdir / "Dockerfile"
    named = _dockerfile_entrypoint_filename(dockerfile.read_text(errors="replace")) if dockerfile.exists() else None
    if named:
        found = _discover_file(workdir, named)
        if found:
            return found
    return _discover_file(workdir, DEFAULT_ENTRYPOINT_NAME)


def run_intake(state: ReviewState) -> ReviewState:
    findings: list[Finding] = list(state.get("findings", []))
    workdir = Path(tempfile.mkdtemp(prefix="review-"))

    try:
        extract_submission(state["tarball_path"], workdir)
    except Exception as exc:
        findings.append({
            "stage": "intake",
            "severity": "critical",
            "summary": "Submission archive could not be safely extracted",
            "detail": str(exc),
        })
        return {**state, "findings": findings, "workdir": str(workdir), "intake_ok": False, "short_circuit": True}

    missing_root = [f for f in REQUIRED_ROOT_FILES if not (workdir / f).exists()]
    if missing_root:
        findings.append({
            "stage": "intake",
            "severity": "critical",
            "summary": "Submission is missing required root files",
            "detail": f"Missing at the archive root: {', '.join(missing_root)}. "
                       f"See SELLER_GUIDE.md — Dockerfile and requirements.txt must be at the top level.",
        })
        return {**state, "findings": findings, "workdir": str(workdir), "intake_ok": False, "short_circuit": True}

    entrypoint = _discover_entrypoint(workdir)
    prompts = _discover_file(workdir, PROMPTS_FILENAME)

    missing_discovered = []
    if entrypoint is None:
        missing_discovered.append("an entrypoint script (either agent.py, or a .py file matching "
                                   "the Dockerfile's CMD/ENTRYPOINT)")
    if prompts is None:
        missing_discovered.append("prompts.py (anywhere in the submission)")

    if missing_discovered:
        findings.append({
            "stage": "intake",
            "severity": "critical",
            "summary": "Submission is missing required source files",
            "detail": f"Could not find: {'; '.join(missing_discovered)}. See SELLER_GUIDE.md "
                       f"for the required agent contract.",
        })
        return {**state, "findings": findings, "workdir": str(workdir), "intake_ok": False, "short_circuit": True}

    return {
        **state,
        "findings": findings,
        "workdir": str(workdir),
        "entrypoint_path": str(entrypoint.relative_to(workdir)),
        "prompts_path": str(prompts.relative_to(workdir)),
        "intake_ok": True,
        "short_circuit": False,
    }
