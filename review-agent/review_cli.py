"""Local trigger for the review pipeline without going through the API.

Usage:
    python review_cli.py <path-to-source-dir-or-tarball> <path-to-metadata.json>

metadata.json shape:
    {"name": "...", "description": "...", "category": "content",
     "hourly_rate": 25.0, "avg_hours": 3.0}
"""
import json
import sys
from pathlib import Path

from app.database import init_db, SessionLocal
from app.models import Review
from app.pipeline.packaging import ensure_tarball
from app.pipeline.runner import run_review


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    source_arg, metadata_path = sys.argv[1], sys.argv[2]
    seller = json.loads(Path(metadata_path).read_text())

    tarball_path, is_temp = ensure_tarball(source_arg)
    try:
        init_db()
        final_state = run_review(tarball_path, seller)
    finally:
        if is_temp:
            Path(tarball_path).unlink(missing_ok=True)

    print(f"\nVerdict: {final_state['verdict']}\n")
    print("Reasoning:")
    for line in final_state["reasoning"]:
        print(f"  {line}")

    if final_state.get("quality_avg") is not None:
        print(f"\nQuality avg: {final_state['quality_avg']:.1f}/10")
    if final_state.get("card_copy"):
        print(f"\nCard copy: {final_state['card_copy']}")

    session = SessionLocal()
    try:
        review = Review(
            id=final_state["submission_id"],
            seller_name=seller["name"],
            category=seller["category"],
            hourly_rate=seller["hourly_rate"],
            avg_hours=seller["avg_hours"],
            verdict=final_state["verdict"],
            reasoning=final_state["reasoning"],
            findings=final_state.get("findings", []),
            test_results=final_state.get("test_results", []),
            quality_avg=final_state.get("quality_avg"),
            pricing=final_state.get("pricing"),
            card_copy=final_state.get("card_copy"),
            image_tag=final_state.get("image_tag") or None,
        )
        session.add(review)
        session.commit()
        print(f"\nSaved as review {review.id}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
