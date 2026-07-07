"""
HTTP client for review-agent (seller submission reviewer), port 8010 externally / 8000
inside its own container — see review-agent/app/main.py and app/models.py::ReviewOut.

A single call to POST /review can take a long time (it builds a Docker image and runs
sandboxed dynamic tests), so this client is only ever invoked from a background task (see
routers/seller_agents.py) — never inline in a request handler.
"""
import logging
import time
from pathlib import Path

import httpx

from app.config import settings
from app.logging_setup import log_kv

logger = logging.getLogger("review_agent_client")

# Review pipeline builds a Docker image + runs sandboxed tests; give it a generous ceiling.
_TIMEOUT = httpx.Timeout(900.0, connect=10.0)


class ReviewAgentError(Exception):
    pass


def _content_type_for(path: Path) -> str:
    if path.name.endswith(".zip"):
        return "application/zip"
    return "application/gzip"


def submit_review(
    tarball_path: str,
    name: str,
    description: str,
    category: str,
    hourly_rate: float,
    avg_hours: float,
) -> dict:
    """POST /review (multipart) -> ReviewOut dict."""
    started = time.monotonic()
    path = Path(tarball_path)
    try:
        with path.open("rb") as fh:
            files = {"source": (path.name, fh, _content_type_for(path))}
            data = {
                "name": name,
                "description": description,
                "category": category,
                "hourly_rate": str(hourly_rate),
                "avg_hours": str(avg_hours),
            }
            with httpx.Client(base_url=settings.REVIEW_AGENT_URL, timeout=_TIMEOUT) as client:
                resp = client.post("/review", data=data, files=files)
                resp.raise_for_status()
                result = resp.json()
        log_kv(
            logger, logging.INFO, "review-agent submit_review ok",
            name=name, verdict=result.get("verdict"),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        return result
    except httpx.HTTPError as exc:
        log_kv(
            logger, logging.ERROR, "review-agent submit_review failed",
            name=name, error=str(exc), latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise ReviewAgentError(f"submit_review failed: {exc}") from exc
