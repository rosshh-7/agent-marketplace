"""End-to-end pipeline tests against the fixtures in tests/fixtures/.

These run real `docker build`/`docker run` against each fixture (needs a local Docker
daemon). The review agent's own judge calls (app.llm_client.chat) are mocked so this suite
never spends real LLM credits — that mock only covers the review agent's audit/scoring
calls, not the fixture agents' own generation. `stub-agent` never calls an LLM at all (see
its docstring) so it fully exercises dynamic_test -> judge -> pricing -> decision for free.

`good-agent` / `borderline-agent` call a real LLM from inside the container (Anthropic by
default, or Grok if LLM_PROVIDER=xai is set) to prove actual prompt-injection resistance —
run those manually via review_cli.py once you have live API credits; they're not included
here to keep this suite hermetic and free to run.
"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.pipeline.packaging import ensure_tarball
from app.pipeline.runner import run_review

FIXTURES = Path(__file__).parent / "fixtures"


def fake_chat(system: str, user: str, max_tokens: int = 1000) -> str:
    if "security auditor" in system:
        return json.dumps({"severity": "none", "flags": [], "summary": "no issues found"})
    if "grading the output" in system:
        return json.dumps({"score": 8.5, "rationale": "on-brief and coherent"})
    if "marketplace listing blurbs" in system:
        return json.dumps({"card_copy": "Writes clean, on-brief content for B2B audiences."})
    if "prompt-injection attack" in system:
        return json.dumps({"complied": False, "reason": "agent refused and stayed on-topic"})
    raise AssertionError(f"unexpected judge system prompt: {system[:80]!r}")


@pytest.fixture(autouse=True)
def mocked_judge():
    with patch("app.llm_client.chat", side_effect=fake_chat):
        yield


def _load_metadata(path: Path) -> dict:
    return json.loads(path.read_text())


def _run_fixture(fixture_dir: Path, metadata_filename: str = "metadata.json") -> dict:
    seller = _load_metadata(fixture_dir / metadata_filename)
    tarball_path, is_temp = ensure_tarball(str(fixture_dir))
    try:
        return run_review(tarball_path, seller)
    finally:
        if is_temp:
            Path(tarball_path).unlink(missing_ok=True)


def test_malicious_agent_is_rejected():
    result = _run_fixture(FIXTURES / "malicious-agent")

    assert result["verdict"] == "REJECT"
    critical = [f for f in result["findings"] if f["severity"] == "critical"]
    assert any("subprocess" in f["summary"] or "Dangerous call" in f["summary"] for f in critical)
    assert any("secret" in f["summary"].lower() for f in critical)


def test_stub_agent_is_approved():
    result = _run_fixture(FIXTURES / "stub-agent")

    assert result["verdict"] == "APPROVE", result["reasoning"]
    assert result["quality_avg"] == pytest.approx(8.5)
    assert result["card_copy"]


def test_stub_agent_with_outlier_pricing_is_flagged():
    result = _run_fixture(FIXTURES / "stub-agent", "metadata-flag.json")

    assert result["verdict"] == "FLAG", result["reasoning"]
    assert result["pricing"]["outlier"] is True


def test_nested_layout_agent_is_discovered_and_approved():
    """main.py at root, agent/graph.py + agent/nodes.py + agent/prompts.py nested — proves
    intake discovers the entrypoint via the Dockerfile CMD and prompts.py anywhere in the
    tree, and that the SDK-contract check isn't limited to a single hardcoded file."""
    result = _run_fixture(FIXTURES / "nested-layout-agent")

    assert result["verdict"] == "APPROVE", result["reasoning"]
    assert result["quality_avg"] == pytest.approx(8.5)
