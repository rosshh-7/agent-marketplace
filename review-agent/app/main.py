import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import init_db, SessionLocal
from app.models import Review, ReviewOut
from app.pipeline.runner import run_review

app = FastAPI(title="Agent Marketplace — Review Agent")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.post("/review", response_model=ReviewOut)
async def submit_review(
    source: UploadFile = File(..., description="tarball (.tar.gz) or .zip of the seller's agent source"),
    name: str = Form(...),
    description: str = Form(""),
    category: str = Form(...),
    hourly_rate: float = Form(...),
    avg_hours: float = Form(...),
):
    suffix = Path(source.filename or "submission.tar.gz").suffix
    if source.filename and source.filename.endswith(".tar.gz"):
        suffix = ".tar.gz"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await source.read())
        tarball_path = tmp.name

    seller = {
        "name": name,
        "description": description,
        "category": category,
        "hourly_rate": hourly_rate,
        "avg_hours": avg_hours,
    }

    try:
        final_state = run_review(tarball_path, seller)
    finally:
        Path(tarball_path).unlink(missing_ok=True)

    session: Session = SessionLocal()
    try:
        review = Review(
            id=final_state["submission_id"],
            seller_name=name,
            category=category,
            hourly_rate=hourly_rate,
            avg_hours=avg_hours,
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
        session.refresh(review)
        return review
    finally:
        session.close()


@app.get("/reviews", response_model=list[ReviewOut])
def list_reviews():
    session = SessionLocal()
    try:
        return session.execute(select(Review).order_by(Review.created_at.desc())).scalars().all()
    finally:
        session.close()


@app.get("/reviews/{review_id}", response_model=ReviewOut)
def get_review(review_id: str):
    session = SessionLocal()
    try:
        review = session.get(Review, review_id)
        if review is None:
            raise HTTPException(status_code=404, detail="review not found")
        return review
    finally:
        session.close()
