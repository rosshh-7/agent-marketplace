from typing import Any, List, Literal, Optional, TypedDict

Severity = Literal["critical", "medium", "low", "info"]


class Finding(TypedDict):
    stage: str          # which pipeline stage produced this
    severity: Severity
    summary: str
    detail: str


class TestCaseResult(TypedDict):
    name: str            # golden-1, golden-2, edge-empty, adversarial-injection, canary-secret
    kind: str            # golden | edge | adversarial | canary
    exit_code: Optional[int]
    timed_out: bool
    stdout_tail: str
    output_text: Optional[str]
    passed: bool
    notes: str


class SellerMetadata(TypedDict):
    name: str
    description: str
    category: str
    hourly_rate: float
    avg_hours: float


class ReviewState(TypedDict, total=False):
    submission_id: str
    tarball_path: str
    workdir: str
    seller: SellerMetadata

    findings: List[Finding]

    intake_ok: bool
    entrypoint_path: str  # relative to workdir, e.g. "agent.py" or "main.py"
    prompts_path: str     # relative to workdir, e.g. "prompts.py" or "agent/prompts.py"
    image_tag: str
    build_ok: bool
    build_log_tail: str

    test_results: List[TestCaseResult]
    dynamic_ok: bool

    prompt_audit: dict[str, Any]
    quality_scores: List[float]
    quality_avg: Optional[float]
    card_copy: Optional[str]

    pricing: dict[str, Any]

    verdict: Literal["APPROVE", "FLAG", "REJECT"]
    reasoning: List[str]
    short_circuit: bool
