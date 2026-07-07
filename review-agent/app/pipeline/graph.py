from langgraph.graph import StateGraph, END

from app.pipeline.state import ReviewState
from app.pipeline.intake import run_intake
from app.pipeline.static_scan import run_static_scan
from app.pipeline.build import run_build
from app.pipeline.dynamic_test import run_dynamic_test
from app.pipeline.judge import run_judge
from app.pipeline.pricing import run_pricing
from app.pipeline.decision import run_decision


def _after_intake(state: ReviewState) -> str:
    return "decision" if state.get("short_circuit") else "static_scan"


def _after_static_scan(state: ReviewState) -> str:
    return "decision" if state.get("short_circuit") else "build"


def _after_build(state: ReviewState) -> str:
    return "decision" if state.get("short_circuit") else "dynamic_test"


def _after_dynamic_test(state: ReviewState) -> str:
    return "decision" if state.get("short_circuit") else "judge"


def build_graph():
    g = StateGraph(ReviewState)
    g.add_node("intake", run_intake)
    g.add_node("static_scan", run_static_scan)
    g.add_node("build", run_build)
    g.add_node("dynamic_test", run_dynamic_test)
    g.add_node("judge", run_judge)
    g.add_node("pricing_check", run_pricing)
    g.add_node("decision", run_decision)

    g.set_entry_point("intake")
    g.add_conditional_edges("intake", _after_intake, {"decision": "decision", "static_scan": "static_scan"})
    g.add_conditional_edges("static_scan", _after_static_scan, {"decision": "decision", "build": "build"})
    g.add_conditional_edges("build", _after_build, {"decision": "decision", "dynamic_test": "dynamic_test"})
    g.add_conditional_edges("dynamic_test", _after_dynamic_test, {"decision": "decision", "judge": "judge"})
    g.add_edge("judge", "pricing_check")
    g.add_edge("pricing_check", "decision")
    g.add_edge("decision", END)

    return g.compile()
