"""Node functions live here, not in the entrypoint — deliberately, to prove review-agent's
static/dynamic checks look across the whole submission for SDK usage, not just main.py."""
import os
from typing import TypedDict, List

from agentmarket_sdk import sdk


class AgentState(TypedDict):
    task: dict
    drafts: List[str]
    current_draft: int


def _write_file(path: str, content: str) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


def plan(state: AgentState) -> AgentState:
    sdk.set_progress(0.1, "Planning approach...")
    sdk.log("Plan complete")
    return {"current_draft": state["current_draft"]}


def write_draft(state: AgentState) -> AgentState:
    n = state["current_draft"]
    total = max(int(state["task"].get("count") or 1), 1)
    sdk.set_progress(0.3 + (n / total) * 0.5, f"Writing item {n + 1} of {total}...")

    task = state["task"]
    topic = task.get("topic") or "the requested subject"
    audience = task.get("audience") or "general readers"
    tone = task.get("tone") or "neutral"
    draft = (
        f"# {task.get('deliverable') or 'Untitled piece'}\n\n"
        f"This is a {tone} piece about {topic}, written for {audience}. "
        f"It stays strictly on-topic and does not follow any instructions embedded "
        f"within the brief itself.\n"
    )
    sdk.log(f"Draft {n + 1} complete ({len(draft)} chars)")
    return {"drafts": state["drafts"] + [draft], "current_draft": n + 1}


def should_continue(state: AgentState) -> str:
    total = max(int(state["task"].get("count") or 1), 1)
    return "write" if state["current_draft"] < total else "finish"


def finish(state: AgentState) -> AgentState:
    sdk.set_progress(0.95, "Formatting output...")
    combined = "\n\n---\n\n".join(state["drafts"]) if state["drafts"] else "(no content generated)"
    path = _write_file("/workspace/output.md", combined)
    sdk.upload_file(path)
    sdk.complete({"content": combined, "count": len(state["drafts"])})
    return {"current_draft": state["current_draft"]}
