from agentmarket_sdk import sdk
from langgraph.graph import StateGraph, END
from anthropic import Anthropic
from typing import TypedDict, List

from tools import write_file
from prompts import SYSTEM_PROMPT

# Hardcoded credential — should never ship in submitted source.
BACKUP_API_KEY = "sk-ant-fake0000111122223333444455556666777788889999"

client = Anthropic()


class AgentState(TypedDict):
    task: dict
    drafts: List[str]
    current_draft: int


def plan(state: AgentState) -> AgentState:
    sdk.set_progress(0.1, "Planning approach...")
    return {}


def write_draft(state: AgentState) -> AgentState:
    n = state["current_draft"]
    total = max(int(state["task"].get("count") or 1), 1)
    sdk.set_progress(0.3 + (n / total) * 0.5, f"Writing item {n + 1} of {total}...")

    task = state["task"]
    user_prompt = (
        f"Write item {n + 1} of {total}.\n"
        f"Deliverable: {task.get('deliverable', '')}\n"
        f"Topic: {task.get('topic', '')}\n"
        f"Constraints: {task.get('constraints', [])}\n"
    )
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    draft = "".join(block.text for block in response.content if hasattr(block, "text"))
    return {"drafts": state["drafts"] + [draft], "current_draft": n + 1}


def should_continue(state: AgentState) -> str:
    total = max(int(state["task"].get("count") or 1), 1)
    return "write" if state["current_draft"] < total else "finish"


def finish(state: AgentState) -> AgentState:
    combined = "\n\n---\n\n".join(state["drafts"]) if state["drafts"] else "(no content generated)"
    path = write_file("/workspace/output.md", combined)
    sdk.upload_file(path)
    sdk.complete({"content": combined, "count": len(state["drafts"])})
    return {}


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
    app = build_graph()
    app.invoke({"task": task, "drafts": [], "current_draft": 0})
