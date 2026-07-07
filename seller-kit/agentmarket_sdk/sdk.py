import os, json, requests

API_BASE = os.getenv("AGENTMARKET_API", "http://localhost:8000")
JOB_ID   = os.getenv("JOB_ID")

def task_input() -> dict:
    """Returns the task spec dict. In Phase 1 stub reads from TASK_SPEC env var or local file."""
    raw = os.getenv("TASK_SPEC")
    if raw:
        return json.loads(raw)
    with open("task_spec.json") as f:        # Phase 1 fallback
        return json.load(f)

def set_progress(pct: float, message: str = "") -> None:
    """0.0 to 1.0. Platform stores this and streams to customer dashboard."""
    try:
        requests.patch(f"{API_BASE}/jobs/{JOB_ID}/progress",
                       json={"pct": round(pct, 2), "message": message}, timeout=3)
    except Exception:
        print(f"[progress] {int(pct*100)}% — {message}")   # fallback for Phase 1

def log(message: str) -> None:
    print(f"[agent] {message}")

_last_uploaded_path = None  # set by upload_file(), consumed by complete() below

def complete(result: dict, output_path: str = None) -> None:
    """Call this once at the end. Triggers email notification and billing stop.

    output_path lets an agent report a specific deliverable (e.g. the .zip it
    already sent via upload_file()) instead of the default text dump. If
    omitted, and upload_file() was called earlier in this run, that file is
    reported automatically — an agent that uploads a binary/zip deliverable
    doesn't also need a redundant result.md to point the platform at the
    right file. Only text-only agents that never call upload_file() fall back
    to writing result["content"] to result.md, exactly as before.
    """
    if output_path is None:
        output_path = _last_uploaded_path
    if output_path is None:
        output_path = f"/outputs/{JOB_ID or 'local'}/result.md"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        content = result.get("content", str(result))
        with open(output_path, "w") as f:
            f.write(content)
    try:
        requests.post(f"{API_BASE}/jobs/{JOB_ID}/complete",
                      json={"output_path": output_path}, timeout=5)
    except Exception:
        print(f"[complete] Output written to {output_path}")

def upload_file(local_path: str) -> str:
    """For Phase 1 POC: just copies file to /outputs/. Returns the destination path."""
    import shutil
    global _last_uploaded_path
    dest = f"/outputs/{JOB_ID or 'local'}/{os.path.basename(local_path)}"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(local_path, dest)
    _last_uploaded_path = dest
    return dest
