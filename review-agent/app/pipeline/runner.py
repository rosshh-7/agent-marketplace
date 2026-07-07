import shutil
import uuid
from pathlib import Path

from app.pipeline.graph import build_graph
from app.pipeline.state import ReviewState

_graph = None


def _graph_or_build():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_review(tarball_path: str, seller: dict) -> ReviewState:
    initial: ReviewState = {
        "submission_id": str(uuid.uuid4()),
        "tarball_path": tarball_path,
        "seller": seller,
        "findings": [],
        "test_results": [],
        "reasoning": [],
        "short_circuit": False,
    }

    final_state = _graph_or_build().invoke(initial, config={"recursion_limit": 25})

    workdir = final_state.get("workdir")
    if workdir and Path(workdir).exists():
        shutil.rmtree(workdir, ignore_errors=True)

    return final_state
