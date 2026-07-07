import ast
import re
from pathlib import Path

from app.config import DANGEROUS_CALLS, DANGEROUS_DOCKERFILE_PATTERNS, SECRET_PATTERNS
from app.pipeline.state import Finding, ReviewState

BUILTIN_DANGEROUS = {"eval", "exec", "compile"}


class _AliasVisitor(ast.NodeVisitor):
    """Builds a map of local name -> dotted qualified name from imports."""

    def __init__(self) -> None:
        self.aliases: dict[str, str] = {}

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            local = alias.asname or alias.name.split(".")[0]
            self.aliases[local] = alias.name

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if not node.module:
            return
        for alias in node.names:
            local = alias.asname or alias.name
            self.aliases[local] = f"{node.module}.{alias.name}"


def _resolve_call_name(func: ast.AST, aliases: dict[str, str]) -> str | None:
    if isinstance(func, ast.Name):
        return aliases.get(func.id, func.id)
    if isinstance(func, ast.Attribute):
        parts = []
        node = func
        while isinstance(node, ast.Attribute):
            parts.append(node.attr)
            node = node.value
        if isinstance(node, ast.Name):
            root = aliases.get(node.id, node.id)
            parts.append(root)
            return ".".join(reversed(parts))
    return None


def _scan_python_file(path: Path, rel: str, findings: list[Finding]) -> None:
    try:
        source = path.read_text(errors="replace")
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        findings.append({
            "stage": "static_scan",
            "severity": "critical",
            "summary": f"{rel} has a Python syntax error",
            "detail": str(exc),
        })
        return

    alias_visitor = _AliasVisitor()
    alias_visitor.visit(tree)

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            resolved = _resolve_call_name(node.func, alias_visitor.aliases)
            if resolved in DANGEROUS_CALLS or (isinstance(node.func, ast.Name) and node.func.id in BUILTIN_DANGEROUS):
                name = resolved or getattr(node.func, "id", "?")
                findings.append({
                    "stage": "static_scan",
                    "severity": "critical",
                    "summary": f"Dangerous call `{name}` found in {rel}",
                    "detail": f"Line {getattr(node, 'lineno', '?')}: calls to {name} are not allowed in submitted agent code.",
                })

    for pattern in SECRET_PATTERNS:
        for match in re.finditer(pattern, source):
            findings.append({
                "stage": "static_scan",
                "severity": "critical",
                "summary": f"Possible hardcoded secret in {rel}",
                "detail": f"Matched pattern near: ...{source[max(0, match.start()-10):match.end()+5]!r}...",
            })


def _scan_requirements(workdir: Path, findings: list[Finding]) -> None:
    req_path = workdir / "requirements.txt"
    if not req_path.exists():
        return
    for line in req_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "==" not in line and not line.startswith("-"):
            findings.append({
                "stage": "static_scan",
                "severity": "low",
                "summary": f"Unpinned dependency: {line}",
                "detail": "Pin dependencies with == to keep builds reproducible and auditable.",
            })


def _scan_dockerfile(workdir: Path, findings: list[Finding]) -> None:
    dockerfile = workdir / "Dockerfile"
    if not dockerfile.exists():
        return
    text = dockerfile.read_text()
    for pattern in DANGEROUS_DOCKERFILE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
            findings.append({
                "stage": "static_scan",
                "severity": "critical",
                "summary": "Dockerfile contains a disallowed pattern",
                "detail": f"Matched pattern: {pattern}",
            })


def _scan_sdk_contract(workdir: Path, findings: list[Finding]) -> bool:
    """Checked across every .py file in the submission, not just the entrypoint — in a
    normal package layout the actual sdk.task_input()/complete() calls often live in a
    nested module (e.g. agent/nodes.py) rather than the entrypoint script itself."""
    uses_sdk_import = False
    calls = {"task_input": False, "set_progress": False, "complete": False}
    for path in workdir.rglob("*.py"):
        if "agentmarket_sdk" in path.parts:
            continue
        source = path.read_text(errors="replace")
        uses_sdk_import = uses_sdk_import or "agentmarket_sdk" in source
        for name in calls:
            calls[name] = calls[name] or f"{name}(" in source or f"{name} (" in source

    ok = uses_sdk_import and calls["task_input"] and calls["complete"]
    if not uses_sdk_import:
        findings.append({
            "stage": "static_scan",
            "severity": "critical",
            "summary": "Submission does not import agentmarket_sdk anywhere",
            "detail": "Every agent must communicate with the platform exclusively through the SDK.",
        })
    else:
        if not calls["task_input"]:
            findings.append({
                "stage": "static_scan",
                "severity": "critical",
                "summary": "Submission never calls sdk.task_input()",
                "detail": "Agents must read their task via the SDK contract, not ad-hoc env vars/files.",
            })
        if not calls["complete"]:
            findings.append({
                "stage": "static_scan",
                "severity": "critical",
                "summary": "Submission never calls sdk.complete()",
                "detail": "Agents must signal completion via the SDK so billing/notification can fire. "
                           "A long-running server process that never calls complete() is not a valid "
                           "agent contract — see SELLER_GUIDE.md.",
            })
        if not calls["set_progress"]:
            findings.append({
                "stage": "static_scan",
                "severity": "low",
                "summary": "Submission never calls sdk.set_progress()",
                "detail": "Not required, but customers see no progress updates without it.",
            })
    return ok


def run_static_scan(state: ReviewState) -> ReviewState:
    workdir = Path(state["workdir"])
    findings: list[Finding] = list(state.get("findings", []))

    for path in sorted(workdir.rglob("*.py")):
        if "agentmarket_sdk" in path.parts:
            continue
        _scan_python_file(path, str(path.relative_to(workdir)), findings)

    _scan_requirements(workdir, findings)
    _scan_dockerfile(workdir, findings)
    sdk_ok = _scan_sdk_contract(workdir, findings)

    has_critical = any(f["severity"] == "critical" for f in findings if f["stage"] == "static_scan")

    return {
        **state,
        "findings": findings,
        "short_circuit": has_critical or not sdk_ok,
    }
