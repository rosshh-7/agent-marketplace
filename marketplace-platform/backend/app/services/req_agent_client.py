"""
HTTP client for req-agent (requirement-gathering agent), port 8002 — see
req-agent/api/server.py for the real routes this wraps. Every call is logged (outcome +
latency) since this is one of the two upstream services the contract calls out as a primary
debugging surface once containerized.
"""
import logging
import time

import httpx

from app.config import settings
from app.logging_setup import log_kv

logger = logging.getLogger("req_agent_client")

_TIMEOUT = httpx.Timeout(30.0, connect=5.0)


class ReqAgentError(Exception):
    pass


def _client() -> httpx.Client:
    return httpx.Client(base_url=settings.REQ_AGENT_URL, timeout=_TIMEOUT)


def create_session(topic: str = "general", mode: str = "conversation") -> dict:
    """POST /sessions -> {session_id, message, topic, mode}"""
    started = time.monotonic()
    try:
        with _client() as client:
            resp = client.post("/sessions", json={"topic": topic, "mode": mode})
            resp.raise_for_status()
            data = resp.json()
        log_kv(
            logger, logging.INFO, "req-agent create_session ok",
            session_id=data.get("session_id"), latency_ms=int((time.monotonic() - started) * 1000),
        )
        return data
    except httpx.HTTPError as exc:
        log_kv(
            logger, logging.ERROR, "req-agent create_session failed",
            error=str(exc), latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise ReqAgentError(f"create_session failed: {exc}") from exc


def chat(session_id: str, message: str) -> dict:
    """POST /sessions/{id}/chat -> {session_id, message, phase}"""
    started = time.monotonic()
    try:
        with _client() as client:
            resp = client.post(f"/sessions/{session_id}/chat", json={"message": message})
            resp.raise_for_status()
            data = resp.json()
        log_kv(
            logger, logging.INFO, "req-agent chat ok",
            session_id=session_id, phase=data.get("phase"),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        return data
    except httpx.HTTPError as exc:
        log_kv(
            logger, logging.ERROR, "req-agent chat failed",
            session_id=session_id, error=str(exc),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise ReqAgentError(f"chat failed: {exc}") from exc


def finalize(session_id: str) -> dict:
    """POST /sessions/{id}/finalize -> {requirements, json_path, markdown_path, transcript_path}"""
    started = time.monotonic()
    try:
        with _client() as client:
            resp = client.post(f"/sessions/{session_id}/finalize")
            resp.raise_for_status()
            data = resp.json()
        log_kv(
            logger, logging.INFO, "req-agent finalize ok",
            session_id=session_id, latency_ms=int((time.monotonic() - started) * 1000),
        )
        return data
    except httpx.HTTPError as exc:
        log_kv(
            logger, logging.ERROR, "req-agent finalize failed",
            session_id=session_id, error=str(exc),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise ReqAgentError(f"finalize failed: {exc}") from exc


def confirm(session_id: str) -> dict:
    """POST /sessions/{id}/confirm -> {requirements, review_status, review_feedback, review_gaps, review_strengths, feasibility_score}"""
    started = time.monotonic()
    try:
        with _client() as client:
            resp = client.post(f"/sessions/{session_id}/confirm")
            resp.raise_for_status()
            data = resp.json()
        log_kv(
            logger, logging.INFO, "req-agent confirm ok",
            session_id=session_id, review_status=data.get("review_status"),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        return data
    except httpx.HTTPError as exc:
        log_kv(
            logger, logging.ERROR, "req-agent confirm failed",
            session_id=session_id, error=str(exc),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise ReqAgentError(f"confirm failed: {exc}") from exc


def get_requirements(session_id: str) -> dict:
    """GET /sessions/{id}/requirements -> {phase, requirements}"""
    try:
        with _client() as client:
            resp = client.get(f"/sessions/{session_id}/requirements")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        log_kv(logger, logging.ERROR, "req-agent get_requirements failed", session_id=session_id, error=str(exc))
        raise ReqAgentError(f"get_requirements failed: {exc}") from exc
