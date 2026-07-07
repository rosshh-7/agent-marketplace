import concurrent.futures
import shutil
import uuid
from pathlib import Path

import docker
from docker.errors import BuildError, APIError

from app.config import APP_DIR, BUILD_TIMEOUT_SECONDS
from app.pipeline.state import ReviewState


def _inject_vendored_sdk(workdir: Path) -> None:
    """Sellers must not bring their own copy of the platform SDK — review-agent
    always provides the vendored, trusted copy into the build context."""
    dest = workdir / "agentmarket_sdk"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(APP_DIR / "vendor" / "agentmarket_sdk", dest)


def _build_sync(workdir: Path, tag: str) -> tuple[bool, str]:
    client = docker.from_env()
    log_lines: list[str] = []
    try:
        _, logs = client.images.build(path=str(workdir), tag=tag, rm=True, forcerm=True, network_mode="bridge")
        for chunk in logs:
            if "stream" in chunk:
                log_lines.append(chunk["stream"].rstrip())
        return True, "\n".join(log_lines)
    except BuildError as exc:
        for chunk in exc.build_log:
            if "stream" in chunk:
                log_lines.append(chunk["stream"].rstrip())
        log_lines.append(str(exc))
        return False, "\n".join(log_lines)
    except APIError as exc:
        return False, f"Docker API error during build: {exc}"


def run_build(state: ReviewState) -> ReviewState:
    workdir = Path(state["workdir"])
    _inject_vendored_sdk(workdir)

    tag = f"review-submission-{uuid.uuid4().hex[:12]}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_build_sync, workdir, tag)
        try:
            ok, log_tail = future.result(timeout=BUILD_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError:
            ok, log_tail = False, f"Build exceeded {BUILD_TIMEOUT_SECONDS}s timeout and was aborted."

    findings = list(state.get("findings", []))
    if not ok:
        findings.append({
            "stage": "build",
            "severity": "critical",
            "summary": "Docker build failed",
            "detail": log_tail[-4000:],
        })

    return {
        **state,
        "findings": findings,
        "build_ok": ok,
        "image_tag": tag if ok else "",
        "build_log_tail": log_tail[-2000:],
        "short_circuit": not ok,
    }
