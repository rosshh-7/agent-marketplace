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
from app.models import Agent, Job, Seller, SellerSubmission
from app.schemas import (
    SellerAgentStats,
    SellerDashboard,
    SellerNotification,
    SubmissionDetail,
    SubmissionSummary,
    SubmissionUploadResponse,
)
from app.services.review_agent_client import ReviewAgentError, submit_review

logger = logging.getLogger("seller_agents")
router = APIRouter(prefix="/seller/agents", tags=["seller-agents"])
# Separate router so the path is /api/seller/dashboard, not nested under
# /seller/agents where it would collide with the /{submission_id} route.
dashboard_router = APIRouter(prefix="/seller", tags=["seller-dashboard"])

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


# Jobs in these states are in flight; they only turn into earnings once the
# customer accepts (contract §9: accepted is the terminal happy state).
_ACTIVE_JOB_STATUSES = {"gathering", "queued", "running"}


def _job_value(agent: Agent) -> float:
    """A job's payout: the agent's hourly rate x its average job length.
    Jobs don't track actual hours, so this estimate IS the billing model."""
    return float(agent.hourly_rate or 0) * float(agent.avg_hours or 0)


@dashboard_router.get("/dashboard", response_model=SellerDashboard)
def seller_dashboard(
    current_seller: Seller = Depends(get_current_seller), db: Session = Depends(get_db)
) -> SellerDashboard:
    """
    Usage + earnings rollup across the seller's listed agents, plus a
    notification feed. Notifications are derived on the fly from submission
    reviews and job lifecycle timestamps — no notifications table, so nothing
    to migrate or keep in sync.
    """
    agents = (
        db.query(Agent)
        .filter(Agent.seller_id == current_seller.id)
        .order_by(Agent.created_at.desc())
        .all()
    )
    agent_ids = [a.id for a in agents]
    jobs: list[Job] = (
        db.query(Job).filter(Job.agent_id.in_(agent_ids)).all() if agent_ids else []
    )

    jobs_by_agent: dict[uuid.UUID, list[Job]] = {}
    for job in jobs:
        jobs_by_agent.setdefault(job.agent_id, []).append(job)

    agent_stats: list[SellerAgentStats] = []
    total_earnings = 0.0
    pending_earnings = 0.0
    for agent in agents:
        agent_jobs = jobs_by_agent.get(agent.id, [])
        accepted = sum(1 for j in agent_jobs if j.status == "accepted")
        awaiting = sum(1 for j in agent_jobs if j.status == "ready_for_review")
        earnings = _job_value(agent) * accepted
        total_earnings += earnings
        pending_earnings += _job_value(agent) * awaiting
        agent_stats.append(
            SellerAgentStats(
                agent_id=agent.id,
                name=agent.name,
                category=agent.category,
                status=agent.status,
                hourly_rate=float(agent.hourly_rate) if agent.hourly_rate is not None else None,
                avg_hours=float(agent.avg_hours) if agent.avg_hours is not None else None,
                jobs_total=len(agent_jobs),
                jobs_active=sum(1 for j in agent_jobs if j.status in _ACTIVE_JOB_STATUSES),
                jobs_awaiting_review=awaiting,
                jobs_accepted=accepted,
                jobs_rejected=sum(1 for j in agent_jobs if j.status == "rejected"),
                earnings=round(earnings, 2),
                last_job_at=max((j.created_at for j in agent_jobs), default=None),
            )
        )

    agent_names = {a.id: a.name for a in agents}
    agent_values = {a.id: _job_value(a) for a in agents}
    notifications: list[SellerNotification] = []

    submissions = (
        db.query(SellerSubmission)
        .filter(SellerSubmission.seller_id == current_seller.id, SellerSubmission.reviewed_at.isnot(None))
        .all()
    )
    _SUBMISSION_NOTIF = {
        "approved": ("submission_approved", "{name} approved and listed", "Your agent passed review and is live in the catalog."),
        "flagged": ("submission_flagged", "{name} flagged in review", "Review raised findings — open the submission for details."),
    }
    for sub in submissions:
        kind, title, body = _SUBMISSION_NOTIF.get(
            sub.status,
            ("submission_rejected", "{name} rejected in review", "Open the submission to see the review findings."),
        )
        notifications.append(
            SellerNotification(
                id=f"sub-{sub.id}", kind=kind, title=title.format(name=sub.name), body=body, at=sub.reviewed_at
            )
        )

    for job in jobs:
        name = agent_names.get(job.agent_id, "your agent")
        value = agent_values.get(job.agent_id, 0.0)
        notifications.append(
            SellerNotification(
                id=f"job-{job.id}-hired",
                kind="job_hired",
                title=f"{name} was hired",
                body="A customer started a new job.",
                at=job.created_at,
            )
        )
        if job.accepted_at is not None:
            notifications.append(
                SellerNotification(
                    id=f"job-{job.id}-accepted",
                    kind="job_accepted",
                    title=f"Job accepted — ${value:,.2f} earned",
                    body=f"The customer accepted a deliverable from {name}.",
                    at=job.accepted_at,
                )
            )
        if job.rejected_at is not None:
            notifications.append(
                SellerNotification(
                    id=f"job-{job.id}-rejected",
                    kind="job_rejected",
                    title=f"Job sent back on {name}",
                    body="The customer requested changes.",
                    at=job.rejected_at,
                )
            )

    notifications.sort(key=lambda n: n.at, reverse=True)

    return SellerDashboard(
        total_earnings=round(total_earnings, 2),
        pending_earnings=round(pending_earnings, 2),
        total_jobs=len(jobs),
        active_agents=sum(1 for a in agents if a.status == "active"),
        agents=agent_stats,
        notifications=notifications[:15],
    )


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
