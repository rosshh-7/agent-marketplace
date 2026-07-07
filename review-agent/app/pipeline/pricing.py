from app.config import CATEGORY_PRICE_BASELINES, DEFAULT_PRICE_BASELINE, PRICING_OUTLIER_RATIO
from app.pipeline.state import ReviewState


def run_pricing(state: ReviewState) -> ReviewState:
    seller = state["seller"]
    lo, hi = CATEGORY_PRICE_BASELINES.get(seller.get("category", ""), DEFAULT_PRICE_BASELINE)
    claimed_rate = seller.get("hourly_rate", 0.0)

    outlier = claimed_rate < lo / PRICING_OUTLIER_RATIO or claimed_rate > hi * PRICING_OUTLIER_RATIO
    within_range = lo <= claimed_rate <= hi

    pricing = {
        "claimed_hourly_rate": claimed_rate,
        "claimed_avg_hours": seller.get("avg_hours"),
        "category_baseline_low": lo,
        "category_baseline_high": hi,
        "within_baseline": within_range,
        "outlier": outlier,
    }

    findings = list(state.get("findings", []))
    if outlier:
        findings.append({
            "stage": "pricing",
            "severity": "medium",
            "summary": f"Claimed hourly rate ${claimed_rate:.2f} is far outside the "
                       f"{seller.get('category')} baseline (${lo:.2f}-${hi:.2f})",
            "detail": "Large deviations from category norms need a human sanity check before going live.",
        })
    elif not within_range:
        findings.append({
            "stage": "pricing",
            "severity": "low",
            "summary": f"Claimed hourly rate ${claimed_rate:.2f} is outside the "
                       f"{seller.get('category')} baseline (${lo:.2f}-${hi:.2f})",
            "detail": "Mild deviation from category norms — not blocking on its own.",
        })

    return {**state, "findings": findings, "pricing": pricing}
