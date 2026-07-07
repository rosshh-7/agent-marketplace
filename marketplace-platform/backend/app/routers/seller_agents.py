"""
Seller-facing routes: upload a submission for review, list/inspect the seller's own
submissions. The actual review call is slow (review-agent builds a Docker image and runs
sandboxed dynamic tests) so it's kicked off via FastAPI `BackgroundTasks` and the upload
route returns immediately with status=pending, per contract §5.
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.deps import get_current_seller, get_db
from app.logging_setup import log_kv
from app.models import Agent, Seller, SellerSubmission
from app.schemas import SubmissionDetail, SubmissionSummary, SubmissionUploadResponse
from app.services.review_agent_client import ReviewAgentError, submit_review

logger = logging.getLogger("seller_agents")
router = APIRouter(prefix="/seller/agents", tags=["seller-agents"])

_VERDICT_TO_STATUS = {"APPROVE": "approved", "FLAG": "flagged", "REJECT": "rejected"}

# Kept in sync with the archive types review-agent/app/pipeline/intake.py can extract.
_SUPPORTED_SUFFIXES = (".zip", ".tar.gz", ".tgz", ".tar")


def _archive_suffix(filename: str) -> str:
    if filename.endswith(".tar.gz"):
        return ".tar.gz"
    return Path(filename).suffix


def _slugify(name: str, suffix: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agent"
    return f"{base}-{suffix}"


def _run_review_background(submission_id: uuid.UUID) -> None:
    """
    Runs in a background task/thread after the upload response has already been sent.
    Opens its own DB session since the request-scoped one is closed by then.
    """
    db: Session = SessionLocal()
    try:
        submission = db.get(SellerSubmission, submission_id)
        if submission is None:
            log_kv(logger, logging.ERROR, "background review: submission vanished", submission_id=str(submission_id))
            return

        try:
            result = submit_review(
                tarball_path=submission.tarball_path,
                name=submission.name,
                description=submission.description or "",
                category=submission.category,
                hourly_rate=float(submission.hourly_rate),
                avg_hours=float(submission.avg_hours),
            )
        except ReviewAgentError as exc:
            log_kv(logger, logging.ERROR, "background review failed", submission_id=str(submission_id), error=str(exc))
            submission.status = "rejected"
            submission.review_result = {"error": str(exc)}
            submission.reviewed_at = datetime.now(timezone.utc)
            db.commit()
            return

        verdict = result.get("verdict", "REJECT")
        submission.status = _VERDICT_TO_STATUS.get(verdict, "rejected")
        submission.review_result = result
        submission.reviewed_at = datetime.now(timezone.utc)

        if verdict == "APPROVE":
            image_name = result.get("image_tag") or f"agent-{submission.name.lower()}"
            slug = _slugify(submission.name, str(submission.id)[:8])
            agent = Agent(
                seller_id=submission.seller_id,
                name=submission.name,
                slug=slug,
                description=submission.description,
                category=submission.category,
                hourly_rate=submission.hourly_rate,
                avg_hours=submission.avg_hours,
                image_name=image_name,
                status="active",
                card_copy=result.get("card_copy"),
            )
            db.add(agent)
            db.flush()
            submission.agent_id = agent.id
        # FLAG / REJECT: leave `agents` untouched, findings surfaced via submission detail.

        db.commit()
        log_kv(
            logger, logging.INFO, "background review complete",
            submission_id=str(submission_id), verdict=verdict, status=submission.status,
        )
    finally:
        db.close()


@router.post("/upload", response_model=SubmissionUploadResponse)
def upload_agent(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    description: str = Form(""),
    category: str = Form(...),
    hourly_rate: float = Form(...),
    avg_hours: float = Form(...),
    file: UploadFile = File(...),
    current_seller: Seller = Depends(get_current_seller),
    db: Session = Depends(get_db),
) -> SubmissionUploadResponse:
    suffix = _archive_suffix(file.filename or "submission")
    if suffix not in _SUPPORTED_SUFFIXES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported archive type '{suffix or '(none)'}'. Submit a .zip, .tar.gz, .tgz, or .tar file.",
        )

    submissions_dir = Path(settings.SUBMISSIONS_DIR)
    submissions_dir.mkdir(parents=True, exist_ok=True)

    submission_id = uuid.uuid4()
    tarball_path = submissions_dir / f"{submission_id}{suffix}"
    with tarball_path.open("wb") as fh:
        fh.write(file.file.read())

    submission = SellerSubmission(
        id=submission_id,
        seller_id=current_seller.id,
        name=name,
        description=description,
        category=category,
        hourly_rate=hourly_rate,
        avg_hours=avg_hours,
        tarball_path=str(tarball_path),
        status="pending",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    log_kv(logger, logging.INFO, "seller submission uploaded, queuing review", submission_id=str(submission.id), seller_id=str(current_seller.id))
    background_tasks.add_task(_run_review_background, submission.id)

    return SubmissionUploadResponse(submission_id=submission.id, status=submission.status)


@router.get("", response_model=list[SubmissionSummary])
def list_submissions(current_seller: Seller = Depends(get_current_seller), db: Session = Depends(get_db)) -> list[SubmissionSummary]:
    submissions = (
        db.query(SellerSubmission)
        .filter(SellerSubmission.seller_id == current_seller.id)
        .order_by(SellerSubmission.created_at.desc())
        .all()
    )
    return [SubmissionSummary.model_validate(s) for s in submissions]


@router.get("/{submission_id}", response_model=SubmissionDetail)
def get_submission(
    submission_id: uuid.UUID, current_seller: Seller = Depends(get_current_seller), db: Session = Depends(get_db)
) -> SubmissionDetail:
    submission = db.get(SellerSubmission, submission_id)
    if submission is None or submission.seller_id != current_seller.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Submission not found")
    return SubmissionDetail.model_validate(submission)
