"""
SMTP email on job completion (contract §6). Uses stdlib smtplib/email — no external
mail library needed at this scale. Defaults point at a local Mailhog instance for dev
(SMTP_HOST=mailhog, SMTP_PORT=1025, no auth, no TLS).
"""
import logging
import smtplib
from email.message import EmailMessage

from app.config import settings
from app.logging_setup import log_kv

logger = logging.getLogger("email_service")


def send_job_complete_email(to_email: str, job_id) -> None:
    link = f"{settings.FRONTEND_BASE_URL}/dashboard/jobs/{job_id}"

    msg = EmailMessage()
    msg["Subject"] = "Your Agent Marketplace job is ready for review"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.set_content(
        "Good news — your job has finished running.\n\n"
        f"View the result and preview it here: {link}\n\n"
        "You can download the result at any time, and accept or reject it from your "
        "dashboard once you've reviewed it.\n"
    )

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USER and settings.SMTP_PASS:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASS)
            smtp.send_message(msg)
        log_kv(logger, logging.INFO, "completion email sent", job_id=str(job_id), to=to_email)
    except (smtplib.SMTPException, OSError) as exc:
        # Email is best-effort — a down Mailhog/SMTP relay must never fail the job.
        log_kv(logger, logging.ERROR, "completion email failed", job_id=str(job_id), to=to_email, error=str(exc))
