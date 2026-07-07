"""
Launches worker agent containers via the Python `docker` SDK (not shelling out) — see
PLATFORM_CONTRACT.md §6 for the exact env var / volume-mount contract the SDK
(agentmarket_sdk/sdk.py) depends on. This is intentionally the only place in the backend
that touches the Docker API, so the orchestration surface is easy to find when debugging a
stuck job.

Requires /var/run/docker.sock mounted into the backend's own container (a Docker Agent /
compose concern, flagged in the contract) — `docker.from_env()` picks it up automatically
when present. If the socket isn't mounted (e.g. running the backend bare-metal against a
local Docker Desktop), `docker.from_env()` still works against the default local socket.
"""
import json
import logging
import threading
import time
import uuid

import docker
from docker.errors import DockerException, NotFound

from app.config import settings
from app.database import SessionLocal
from app.logging_setup import log_kv
from app.models import Job

logger = logging.getLogger("docker_launcher")

TERMINAL_STATUSES = {"ready_for_review", "failed", "accepted", "rejected"}


class WorkerLaunchError(Exception):
    pass


def _client() -> docker.DockerClient:
    return docker.from_env()


def launch_worker(job_id: uuid.UUID, image_name: str, task_spec: dict) -> str:
    """
    Starts a detached worker container for `job_id` running `image_name`, per the SDK
    contract in §6:
      - AGENTMARKET_API points back at this backend, Docker-network-resolvable.
      - JOB_ID / TASK_SPEC feed agentmarket_sdk.sdk.task_input().
      - LLM_PROVIDER + provider creds are passed through from backend config.
      - /outputs is bind-mounted from the same identity path the backend itself reads from
        after complete() fires (see app/config.py::OUTPUTS_DIR docstring).

    Returns the launched container's id. Raises WorkerLaunchError on any Docker-side
    failure (image missing, daemon unreachable, etc.) — callers are expected to mark the
    job `failed` on this exception.
    """
    env = {
        "AGENTMARKET_API": settings.BACKEND_INTERNAL_URL,
        "JOB_ID": str(job_id),
        "TASK_SPEC": json.dumps(task_spec, default=str),
        "LLM_PROVIDER": settings.LLM_PROVIDER,
    }
    if settings.LLM_PROVIDER == "xai":
        env["XAI_API_KEY"] = settings.XAI_API_KEY
        env["XAI_MODEL"] = settings.XAI_MODEL
    elif settings.LLM_PROVIDER == "anthropic":
        env["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY
    elif settings.LLM_PROVIDER == "groq":
        env["GROQ_API_KEY"] = settings.GROQ_API_KEY
        env["GROQ_MODEL"] = settings.GROQ_MODEL

    started = time.monotonic()
    try:
        client = _client()
        container = client.containers.run(
            image_name,
            detach=True,
            name=f"job-{job_id}",
            network=settings.AGENT_DOCKER_NETWORK,
            environment=env,
            volumes={settings.OUTPUTS_DIR: {"bind": "/outputs", "mode": "rw"}},
            # NOT auto-removed (deliberate — see _watch_worker below): a worker can die
            # for reasons that have nothing to do with its own code (host Docker daemon
            # restart, OOM, etc.), and auto_remove=True was erasing every trace of that —
            # a job would sit at its last-reported progress forever with no way to tell
            # why. _watch_worker waits for exit, captures logs, reconciles the job's
            # status, and removes the container itself once it's done with it.
            auto_remove=False,
        )
        log_kv(
            logger, logging.INFO, "worker container launched",
            job_id=str(job_id), image=image_name, container_id=container.id,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        threading.Thread(target=_watch_worker, args=(job_id, container.id), daemon=True).start()
        return container.id
    except DockerException as exc:
        log_kv(
            logger, logging.ERROR, "worker container launch failed",
            job_id=str(job_id), image=image_name, error=str(exc),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise WorkerLaunchError(f"failed to launch worker for job {job_id}: {exc}") from exc


def _watch_worker(job_id: uuid.UUID, container_id: str) -> None:
    """
    Runs in a background thread for the lifetime of one launched worker container.
    Blocks until the container exits, then reconciles the job row: if the worker's own
    HTTP callback (POST /jobs/{id}/complete, routers/callbacks.py) already moved the job
    to a terminal status, this is a no-op. If not — the container died without ever
    calling back (crashed, was killed by the host Docker daemon restarting, OOM, ran out
    the clock without finishing) — mark the job `failed` with the container's own exit
    code and a tail of its logs, so the customer sees *something* instead of a job stuck
    at its last-reported progress forever, and so `docker logs` isn't the only way to
    find out what happened after the fact.
    """
    client = _client()
    try:
        container = client.containers.get(container_id)
    except NotFound:
        return  # already gone somehow — nothing to reconcile from our side

    try:
        result = container.wait()
        exit_code = result.get("StatusCode")
    except DockerException as exc:
        log_kv(logger, logging.ERROR, "worker watch: wait() failed", job_id=str(job_id), error=str(exc))
        exit_code = None

    try:
        tail = container.logs(tail=50).decode("utf-8", errors="replace")
    except DockerException:
        tail = "(container logs unavailable)"

    try:
        container.remove(force=True)
    except DockerException:
        pass  # already removed/gone — fine

    log_kv(
        logger, logging.INFO if exit_code == 0 else logging.WARNING,
        "worker container exited", job_id=str(job_id), exit_code=exit_code,
    )

    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if job is None or job.status in TERMINAL_STATUSES:
            return  # completed normally via the SDK callback (or job vanished) — nothing to do
        job.status = "failed"
        job.progress_msg = (
            f"Worker container exited (code {exit_code}) without reporting completion. "
            f"Last lines of its log:\n{tail[-2000:]}"
        )
        db.commit()
        log_kv(logger, logging.WARNING, "job marked failed by watchdog", job_id=str(job_id))
    finally:
        db.close()
