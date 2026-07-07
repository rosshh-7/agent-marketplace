from langgraph.graph import StateGraph, END

from agent.nodes import AgentState, plan, write_draft, should_continue, finish


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
