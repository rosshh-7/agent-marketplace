"""
FastAPI app entrypoint. Route registration map (for tracing a request end-to-end):

  /api/auth/*                  -> routers/auth.py           (customer auth realm)
  /api/seller/auth/*           -> routers/seller_auth.py     (seller auth realm)
  /api/agents*                 -> routers/agents.py          (public browse)
  /api/jobs*                   -> routers/jobs.py            (hire flow, status, preview, download, accept/reject)
  /api/seller/agents*          -> routers/seller_agents.py   (seller upload/list/detail)
  /jobs/{id}/progress          -> routers/callbacks.py       (SDK callback, UNPREFIXED, no auth)
  /jobs/{id}/complete          -> routers/callbacks.py       (SDK callback, UNPREFIXED, no auth)

Run with: uvicorn app.main:app --host 0.0.0.0 --port 8001
"""
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal, init_db
from app.logging_setup import configure_logging, log_kv
from app.routers import agents, auth, callbacks, jobs, seller_agents, seller_auth
from app.seed import seed_agents

configure_logging(settings.LOG_LEVEL)
logger = logging.getLogger("http")

app = FastAPI(title="Agent Marketplace — Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    started = time.monotonic()
    request.state.request_id = request_id
    try:
        response = await call_next(request)
    except Exception:
        log_kv(
            logger, logging.ERROR, "request failed with unhandled exception",
            request_id=request_id, method=request.method, path=request.url.path,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        raise
    latency_ms = int((time.monotonic() - started) * 1000)
    log_kv(
        logger, logging.INFO, "request",
        request_id=request_id, method=request.method, path=request.url.path,
        status=response.status_code, latency_ms=latency_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response


# --- /api/* routes (customer + seller facing, per contract §4) ---
app.include_router(auth.router, prefix="/api")
app.include_router(seller_auth.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(seller_agents.router, prefix="/api")
app.include_router(seller_agents.dashboard_router, prefix="/api")

# --- Unprefixed SDK callback routes (hard constraint, contract §6) ---
app.include_router(callbacks.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    db = SessionLocal()
    try:
        seed_agents(db)
    finally:
        db.close()
    log_kv(logger, logging.INFO, "backend started", database_url=_redact(settings.DATABASE_URL))


def _redact(url: str) -> str:
    # Don't log DB credentials even at INFO — cheap safety net for anyone tailing logs.
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        _, host_part = rest.split("@", 1)
        return f"{scheme}://***@{host_part}"
    return url
