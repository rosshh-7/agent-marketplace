from app.config import QUALITY_SCORE_APPROVE_MIN, QUALITY_SCORE_FLAG_MIN
from app.pipeline.state import ReviewState


def run_decision(state: ReviewState) -> ReviewState:
    findings = state.get("findings", [])
    severities = {f["severity"] for f in findings}
    quality_avg = state.get("quality_avg")

    reasoning: list[str] = []

    critical = [f for f in findings if f["severity"] == "critical"]
    medium = [f for f in findings if f["severity"] == "medium"]

    if critical:
        verdict = "REJECT"
        reasoning.append(f"{len(critical)} critical issue(s) found:")
        reasoning += [f"  - [{f['stage']}] {f['summary']}" for f in critical]
    elif quality_avg is not None and quality_avg < QUALITY_SCORE_FLAG_MIN:
        verdict = "REJECT"
        reasoning.append(f"Output quality score {quality_avg:.1f}/10 is below the minimum "
                          f"bar of {QUALITY_SCORE_FLAG_MIN}/10 — outputs are not usable as-is.")
    elif medium or (quality_avg is not None and quality_avg < QUALITY_SCORE_APPROVE_MIN):
        verdict = "FLAG"
        if medium:
            reasoning.append(f"{len(medium)} issue(s) need a human look:")
            reasoning += [f"  - [{f['stage']}] {f['summary']}" for f in medium]
        if quality_avg is not None and quality_avg < QUALITY_SCORE_APPROVE_MIN:
            reasoning.append(f"Output quality score {quality_avg:.1f}/10 is below the auto-approve "
                              f"bar of {QUALITY_SCORE_APPROVE_MIN}/10 but above the reject floor.")
    else:
        verdict = "APPROVE"
        reasoning.append("No critical or medium findings.")
        if quality_avg is not None:
            reasoning.append(f"Output quality score {quality_avg:.1f}/10 on representative test tasks.")
        reasoning.append("Passed prompt-injection and secret-exfiltration probes.")
        pricing = state.get("pricing") or {}
        if pricing.get("within_baseline"):
            reasoning.append("Pricing is within the category baseline.")

    low = [f for f in findings if f["severity"] == "low"]
    if low:
        reasoning.append(f"{len(low)} minor note(s) (non-blocking): " +
                          "; ".join(f["summary"] for f in low))

    return {**state, "verdict": verdict, "reasoning": reasoning}
