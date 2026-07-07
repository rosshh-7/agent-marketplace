import sqlite3
from pathlib import Path

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver

from .state import RequirementsState
from .nodes import gather_node, extract_node

DB_PATH = Path(__file__).parent.parent / "data" / "sessions.db"


def _route(state: RequirementsState) -> str:
    phase = state.get("phase", "gathering")
    if phase == "extracting":
        return "extract"
    if phase == "done":
        return "__end__"
    return "gather"


def build_graph():
    builder = StateGraph(RequirementsState)

    builder.add_node("gather", gather_node)
    builder.add_node("extract", extract_node)

    builder.add_conditional_edges(
        START,
        _route,
        {
            "gather": "gather",
            "extract": "extract",
            "__end__": END,
        },
    )

    builder.add_edge("gather", END)
    builder.add_edge("extract", END)

    # check_same_thread=False required for multi-threaded FastAPI
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    checkpointer = SqliteSaver(conn)

    return builder.compile(checkpointer=checkpointer)


# Module-level singleton — sessions isolated by thread_id, persisted to SQLite
graph = build_graph()
