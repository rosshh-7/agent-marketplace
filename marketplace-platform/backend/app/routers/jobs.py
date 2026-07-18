"""
Job routes — the hire flow (start/chat/hire), status/listing, chat audit trail, preview,
download, and accept/reject. All require a customer (`user` realm) JWT — see
app/deps.py::get_current_user / get_current_user_flexible for why preview/download accept
the token as a query param too (browser-native <iframe>/download links can't set headers).

This is the module to read top-to-bottom to trace a hire end-to-end: start -> chat (n times)
-> hire (launches the worker container) -> the SDK's callbacks in routers/callbacks.py
update progress/complete this same `jobs` row from the other side.
"""
import logging
import mimetypes
import os
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_current_user_flexible, get_db
from app.logging_setup import log_kv
from app.models import Agent, AgentReview, ChatMessage, Job, User
from app.schemas import (
    ChatMessageOut,
    JobChatRequest,
    JobChatResponse,
    JobDetail,
    JobFinalizeResponse,
    JobHireResponse,
    JobStartRequest,
    JobStartResponse,
    JobSummary,
    RejectRequest,
    ReviewRequest,
    ReviewResponse,
)
from app.services import docker_launcher, req_agent_client
from app.services.docker_launcher import WorkerLaunchError
from app.services.req_agent_client import ReqAgentError
from app.services.task_spec import build_task_spec

logger = logging.getLogger("jobs")
router = APIRouter(prefix="/jobs", tags=["jobs"])


def _get_owned_job(job_id: uuid.UUID, user: User, db: Session) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


def _log_message(db: Session, job_id: uuid.UUID, role: str, content: str) -> None:
    db.add(ChatMessage(job_id=job_id, role=role, content=content))


@router.post("/start", response_model=JobStartResponse)
def start_job(
    body: JobStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobStartResponse:
    agent = db.get(Agent, body.agent_id)
    if agent is None or agent.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found or not active")

    job = Job(
        user_id=current_user.id,
        agent_id=agent.id,
        initial_brief=body.brief,
        status="gathering",
        customer_email=current_user.email,
    )
    db.add(job)
    db.flush()  # assign job.id before we need it for chat_messages

    try:
        session = req_agent_client.create_session(topic="general", mode="conversation")
        job.req_session_id = session["session_id"]
        _log_message(db, job.id, "assistant", session["message"])

        chat_result = req_agent_client.chat(job.req_session_id, body.brief)
    except ReqAgentError as exc:
        db.rollback()
        log_kv(logger, logging.ERROR, "job start failed: req-agent unreachable", agent_id=str(agent.id), error=str(exc))
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Requirement-gathering agent unavailable: {exc}") from exc

    _log_message(db, job.id, "user", body.brief)
    _log_message(db, job.id, "assistant", chat_result["message"])
    db.commit()
    db.refresh(job)

    log_kv(logger, logging.INFO, "job started", job_id=str(job.id), agent_id=str(agent.id), user_id=str(current_user.id))
    return JobStartResponse(job_id=job.id, message=chat_result["message"], phase=chat_result["phase"])


@router.post("/{job_id}/chat", response_model=JobChatResponse)
def chat_job(
    job_id: uuid.UUID,
    body: JobChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobChatResponse:
    job = _get_owned_job(job_id, current_user, db)
    if job.status != "gathering":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Job is not in gathering phase (status={job.status})")
    if not job.req_session_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job has no requirement-gathering session")

    try:
        chat_result = req_agent_client.chat(job.req_session_id, body.message)
    except ReqAgentError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Requirement-gathering agent unavailable: {exc}") from exc

    _log_message(db, job.id, "user", body.message)
    _log_message(db, job.id, "assistant", chat_result["message"])
    db.commit()

    return JobChatResponse(
        message=chat_result["message"],
        phase=chat_result["phase"],
        completeness_score=chat_result.get("completeness_score", 0),
    )


@router.post("/{job_id}/finalize", response_model=JobFinalizeResponse)
def finalize_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobFinalizeResponse:
    """Extract requirements from the chat and return a preview for the user to review.
    Does NOT launch the worker — call /hire after the user confirms."""
    job = _get_owned_job(job_id, current_user, db)
    if job.status != "gathering":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Job is not in gathering phase (status={job.status})")
    if not job.req_session_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job has no requirement-gathering session")

    try:
        finalize_result = req_agent_client.finalize(job.req_session_id)
    except ReqAgentError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Requirement-gathering agent unavailable: {exc}") from exc

    # Persist extracted requirements without launching yet
    job.requirements_raw = finalize_result.get("requirements", {})
    db.commit()

    return JobFinalizeResponse(
        requirements=finalize_result.get("requirements", {}),
        completeness_score=finalize_result.get("completeness_score", 0),
        vague_areas=finalize_result.get("vague_areas", []),
        confirm_message=finalize_result.get("confirm_message", ""),
    )


@router.post("/{job_id}/hire", response_model=JobHireResponse)
def hire_job(
    job_id: uuid.UUID,
    force: bool = Query(default=False, description="Launch even if PM flagged needs_clarification"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobHireResponse:
    job = _get_owned_job(job_id, current_user, db)
    if job.status != "gathering":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Job already past gathering (status={job.status})")
    if not job.req_session_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job has no requirement-gathering session")

    agent = db.get(Agent, job.agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    try:
        # Finalize first (idempotent — returns existing extracted reqs if already in confirming)
        finalize_result = req_agent_client.finalize(job.req_session_id)
        # PM review
        confirm_result = req_agent_client.confirm(job.req_session_id)
    except ReqAgentError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Requirement-gathering agent unavailable: {exc}") from exc

    review_status = confirm_result.get("review_status", "approved")
    common_review = dict(
        review_status=review_status,
        review_feedback=confirm_result.get("review_feedback", ""),
        review_gaps=confirm_result.get("review_gaps", []),
        review_strengths=confirm_result.get("review_strengths", []),
        review_recommendations=confirm_result.get("review_recommendations", []),
        feasibility_score=confirm_result.get("feasibility_score", 0),
    )

    # Block launch when PM needs clarification — unless user explicitly overrides
    if review_status == "needs_clarification" and not force:
        log_kv(logger, logging.INFO, "hire blocked by PM review", job_id=str(job.id), review_status=review_status)
        return JobHireResponse(job_id=job.id, status=job.status, worker_launched=False, **common_review)

    requirements = confirm_result.get("requirements") or finalize_result.get("requirements", {})
    job.requirements_raw = requirements
    job.task_spec = build_task_spec(job.id, agent.category, job.customer_email, requirements)
    job.status = "queued"
    db.commit()

    try:
        docker_launcher.launch_worker(job.id, agent.image_name, job.task_spec)
    except WorkerLaunchError as exc:
        job.status = "failed"
        job.progress_msg = f"Failed to launch worker: {exc}"
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to launch worker agent: {exc}") from exc

    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)

    log_kv(logger, logging.INFO, "job hired and worker launched", job_id=str(job.id), image=agent.image_name)
    return JobHireResponse(job_id=job.id, status=job.status, worker_launched=True, **common_review)


@router.get("/{job_id}/requirements/download")
def download_requirements(
    job_id: uuid.UUID,
    format: str = Query(default="md", pattern="^(md|json)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Download the extracted requirements as Markdown or JSON directly from the job DB."""
    job = _get_owned_job(job_id, current_user, db)
    if not job.requirements_raw:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No requirements extracted yet. Finalize first.")

    req = job.requirements_raw
    project_name = req.get("project_name", "requirements")
    slug = project_name.lower().replace(" ", "_")[:40]

    if format == "json":
        content = json.dumps(req, indent=2)
        media_type = "application/json"
        filename = f"{slug}.json"
    else:
        content = _requirements_to_markdown(req)
        media_type = "text/markdown"
        filename = f"{slug}.md"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _requirements_to_markdown(req: dict) -> str:
    from datetime import datetime as dt
    lines = [f"# Requirements: {req.get('project_name', 'Untitled Project')}\n"]
    lines += [f"*Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}*", ""]

    if overview := req.get("project_overview"):
        lines += ["## Overview\n", overview, ""]
    if goals := req.get("goals"):
        lines += ["## Goals", *[f"- {g}" for g in goals], ""]
    if frs := req.get("functional_requirements"):
        lines.append("## Functional Requirements\n")
        for fr in frs:
            pri = fr.get("priority", "medium").upper()
            lines += [f"### {fr.get('id')} — {fr.get('title')} `[{pri}]`", fr.get("description", ""), ""]
    if nfrs := req.get("non_functional_requirements"):
        lines.append("## Non-Functional Requirements\n")
        for nfr in nfrs:
            lines += [f"### {nfr.get('id')} — {nfr.get('category', '').title()}", nfr.get("description", ""), ""]
    if constraints := req.get("constraints"):
        lines += ["## Constraints", *[f"- {c}" for c in constraints], ""]
    if stakeholders := req.get("stakeholders"):
        lines += ["## Stakeholders", *[f"- {s}" for s in stakeholders], ""]
    if timeline := req.get("timeline"):
        lines += ["## Timeline", timeline, ""]
    if oos := req.get("out_of_scope"):
        lines += ["## Out of Scope", *[f"- {o}" for o in oos], ""]
    if oq := req.get("open_questions"):
        lines += ["## Open Questions", *[f"- {q}" for q in oq], ""]
    return "\n".join(lines)


@router.get("", response_model=list[JobSummary])
def list_jobs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[JobSummary]:
    jobs = (
        db.query(Job)
        .filter(Job.user_id == current_user.id)
        .order_by(Job.created_at.desc())
        .all()
    )
    return [JobSummary.model_validate(j) for j in jobs]


@router.get("/{job_id}", response_model=JobDetail)
def get_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> JobDetail:
    job = _get_owned_job(job_id, current_user, db)
    return JobDetail.model_validate(job)


@router.get("/{job_id}/messages", response_model=list[ChatMessageOut])
def get_job_messages(
    job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ChatMessageOut]:
    job = _get_owned_job(job_id, current_user, db)
    return [ChatMessageOut.model_validate(m) for m in job.messages]


# ---------- Preview / download ----------


def _job_for_preview(job_id: uuid.UUID, user: User, db: Session) -> Job:
    job = _get_owned_job(job_id, user, db)
    if not job.preview_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No preview available for this job yet")
    return job


def _safe_preview_file(preview_root: str, relative_path: str) -> Path:
    root = Path(preview_root).resolve()
    candidate = (root / relative_path).resolve()
    if root not in candidate.parents and candidate != root:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid path")
    if not candidate.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return candidate


@router.get("/{job_id}/preview/")
def preview_index(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
) -> Response:
    job = _job_for_preview(job_id, current_user, db)
    file_path = _safe_preview_file(job.preview_path, "index.html")
    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(file_path, media_type=media_type or "text/html")


@router.get("/{job_id}/preview/{file_path:path}")
def preview_asset(
    job_id: uuid.UUID,
    file_path: str,
    current_user: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
) -> Response:
    job = _job_for_preview(job_id, current_user, db)
    resolved = _safe_preview_file(job.preview_path, file_path or "index.html")
    media_type, _ = mimetypes.guess_type(str(resolved))
    return FileResponse(resolved, media_type=media_type or "application/octet-stream")


@router.get("/{job_id}/download")
def download_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
) -> Response:
    job = _get_owned_job(job_id, current_user, db)
    if not job.output_zip_path or not os.path.isfile(job.output_zip_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No result available for this job yet")
    # No gating per contract §2 — available any time status is ready_for_review or later.
    filename = f"{job_id}.zip" if zipfile.is_zipfile(job.output_zip_path) else Path(job.output_zip_path).name
    return FileResponse(job.output_zip_path, media_type="application/octet-stream", filename=filename)


# ---------- Accept / reject (audit-trail only, contract §2) ----------


@router.post("/{job_id}/accept", response_model=JobDetail)
def accept_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> JobDetail:
    job = _get_owned_job(job_id, current_user, db)
    if job.status not in ("ready_for_review", "accepted", "rejected"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Job is not ready for review (status={job.status})")

    job.status = "accepted"
    job.accepted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    log_kv(logger, logging.INFO, "job accepted", job_id=str(job_id))
    return JobDetail.model_validate(job)


@router.post("/{job_id}/reject", response_model=JobDetail)
def reject_job(
    job_id: uuid.UUID,
    body: RejectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobDetail:
    job = _get_owned_job(job_id, current_user, db)
    if job.status not in ("ready_for_review", "accepted", "rejected"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Job is not ready for review (status={job.status})")

    job.status = "rejected"
    job.rejected_at = datetime.now(timezone.utc)
    job.rejection_reason = body.reason
    db.commit()
    db.refresh(job)
    log_kv(logger, logging.INFO, "job rejected", job_id=str(job_id), reason=body.reason)
    return JobDetail.model_validate(job)


@router.post("/{job_id}/review", response_model=ReviewResponse)
def review_job(
    job_id: uuid.UUID,
    body: ReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewResponse:
    job = _get_owned_job(job_id, current_user, db)
    terminal = {"ready_for_review", "accepted", "rejected"}
    if job.status not in terminal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job must be completed before reviewing.")

    existing = db.query(AgentReview).filter(AgentReview.job_id == job_id).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already reviewed this job.")

    review = AgentReview(
        agent_id=job.agent_id,
        job_id=job_id,
        user_id=current_user.id,
        rating=body.rating,
        feedback=body.feedback,
    )
    db.add(review)

    agent = db.get(Agent, job.agent_id)
    if agent:
        prev_total = (agent.rating_avg or 0) * (agent.rating_count or 0)
        agent.rating_count = (agent.rating_count or 0) + 1
        agent.rating_avg = round((prev_total + body.rating) / agent.rating_count, 2)

    db.commit()
    log_kv(logger, logging.INFO, "job reviewed", job_id=str(job_id), rating=body.rating)
    return ReviewResponse(
        message="Thanks for your feedback!",
        new_rating_avg=float(agent.rating_avg) if agent else 0,
        new_rating_count=agent.rating_count if agent else 0,
    )
