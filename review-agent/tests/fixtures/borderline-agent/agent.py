from agentmarket_sdk import sdk
from langgraph.graph import StateGraph, END
from typing import TypedDict, List

from tools import write_file
from prompts import SYSTEM_PROMPT
from llm import generate


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
    user_prompt = (
        f"Write item {n + 1} of {total}.\n"
        f"Deliverable: {task.get('deliverable', '')}\n"
        f"Topic: {task.get('topic', '')}\n"
        f"Tone: {task.get('tone', '')}\n"
        f"Audience: {task.get('audience', '')}\n"
        f"Target word count: {task.get('word_count_per_item', 300)}\n"
        f"Constraints: {task.get('constraints', [])}\n"
        f"Format: {task.get('format', 'markdown')}\n"
    )
    draft = generate(SYSTEM_PROMPT, user_prompt)
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
