"""
The two routes agentmarket_sdk/sdk.py calls back into, verbatim, from inside worker
containers. **Not prefixed with /api** — this is a hard constraint (contract §6): the SDK
is baked into every worker image, including third-party sellers' already-reviewed
submissions, so these paths cannot change. No auth — trusted Docker-network callers only
(the worker container only has network access to this backend and whatever it dials out to
for its own LLM provider).

This router is mounted directly on the FastAPI `app` in main.py, not under the `/api`
APIRouter the rest of the routes live under.
"""
import logging
import os
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import get_db
from app.logging_setup import log_kv
from app.models import Job
from app.schemas import CompleteCallback, ProgressCallback
from app.services.email_service import send_job_complete_email

logger = logging.getLogger("sdk_callbacks")
router = APIRouter(tags=["sdk-callbacks"])


@router.patch("/jobs/{job_id}/progress")
def update_progress(job_id: uuid.UUID, body: ProgressCallback, db: Session = Depends(get_db)) -> dict:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    job.progress_pct = round(body.pct * 100, 2)
    job.progress_msg = body.message
    db.commit()

    log_kv(
        logger, logging.INFO, "worker progress update",
        job_id=str(job_id), pct=job.progress_pct, message=body.message,
    )
    return {"ok": True}


def _unzip_to_preview_dir(zip_path: str, job_id: uuid.UUID) -> str:
    preview_dir = Path(settings.PREVIEWS_DIR) / str(job_id)
    preview_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(preview_dir)
    return str(preview_dir)


@router.post("/jobs/{job_id}/complete")
def complete_job(job_id: uuid.UUID, body: CompleteCallback, db: Session = Depends(get_db)) -> dict:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    # `output_path` is the path *inside the worker container*, which is identical on the
    # backend's side too (same identity bind mount — see app/config.py::OUTPUTS_DIR).
    output_path = body.output_path
    if not os.path.isfile(output_path):
        log_kv(logger, logging.ERROR, "complete callback: output_path missing on backend side", job_id=str(job_id), output_path=output_path)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"output_path not found: {output_path}")

    job.output_zip_path = output_path

    if zipfile.is_zipfile(output_path):
        try:
            job.preview_path = _unzip_to_preview_dir(output_path, job_id)
        except zipfile.BadZipFile as exc:
            log_kv(logger, logging.ERROR, "complete callback: failed to unzip output", job_id=str(job_id), error=str(exc))
    else:
        # Non-zip deliverables (e.g. the SDK's own text-file fallback) have nothing to
        # preview as a static site; still marks the job complete/downloadable.
        log_kv(logger, logging.INFO, "complete callback: output is not a zip, skipping preview unpack", job_id=str(job_id))

    job.status = "ready_for_review"
    job.completed_at = datetime.now(timezone.utc)
    db.commit()

    log_kv(logger, logging.INFO, "job completed", job_id=str(job_id), output_path=output_path, preview_path=job.preview_path)

    send_job_complete_email(job.customer_email, job.id)

    return {"ok": True}
