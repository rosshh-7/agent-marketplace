"""Deterministic stand-in agent — generates canned content instead of calling a real LLM.

Used to exercise the review pipeline's plumbing (dynamic test -> judge -> pricing ->
decision) end-to-end without spending API credits. It does NOT prove real prompt-injection
resistance the way the live-LLM good-agent/borderline-agent fixtures do, since there's no
model in the loop to actually hijack — see tests/fixtures/good-agent for that check.
"""
from agentmarket_sdk import sdk
from langgraph.graph import StateGraph, END
from typing import TypedDict, List

from tools import write_file
from prompts import SYSTEM_PROMPT  # noqa: F401 — read by the review agent's prompt audit


class AgentState(TypedDict):
    task: dict
    drafts: List[str]
    current_draft: int


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
    path = write_file("/workspace/output.md", combined)
    sdk.upload_file(path)
    sdk.complete({"content": combined, "count": len(state["drafts"])})
    return {"current_draft": state["current_draft"]}


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("plan", plan)
    g.add_node("write", write_draft)
    g.add_node("finish", finish)
    g.set_entry_point("plan")
    g.add_edge("plan", "write")
    g.add_conditional_edges("write", should_continue, {"write": "write", "finish": "finish"})
    g.add_edge("finish", END)
    return g.compile()


if __name__ == "__main__":
    task = sdk.task_input()
    sdk.log(f"Starting task: {task.get('deliverable', 'unknown')}")
    app = build_graph()
    app.invoke({"task": task, "drafts": [], "current_draft": 0})
