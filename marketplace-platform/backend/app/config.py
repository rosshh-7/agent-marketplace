"""
Central configuration, read once from the environment at process start.

Every variable here maps 1:1 onto §10 of PLATFORM_CONTRACT.md, with a couple of
backend-internal additions (marked below) that the contract doesn't name explicitly but
which the orchestration logic in services/docker_launcher.py needs.
"""
import os

from dotenv import load_dotenv

# Loads a local .env file if present (for `uvicorn app.main:app` run straight off the host
# during development); a no-op if the file doesn't exist, and never overrides variables
# already set in the real environment (e.g. inside a container from docker-compose).
load_dotenv(override=False)


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    # --- Postgres ---
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://agentmarket:localdev@localhost:5432/agentmarket"
    )

    # --- Auth ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24 * 7)))  # 7 days

    # --- Upstream agents ---
    REQ_AGENT_URL: str = os.getenv("REQ_AGENT_URL", "http://localhost:8002")
    REVIEW_AGENT_URL: str = os.getenv("REVIEW_AGENT_URL", "http://localhost:8010")

    # --- Worker container orchestration (§6) ---
    AGENT_DOCKER_NETWORK: str = os.getenv("AGENT_DOCKER_NETWORK", "agentmarket-net")
    # Identity bind-mount path (host path == container path on both the backend's own
    # container and every worker container it launches) — same trick as review-agent's
    # DYNAMIC_TEST_OUTPUTS_DIR (see review-agent/app/config.py). The backend calls the
    # *host* Docker daemon (via the mounted docker.sock), so any bind-mount source it hands
    # `docker run` is resolved on the real host filesystem, not inside the backend's own
    # container namespace. Mounting this exact path into the backend container too (done by
    # the Docker Agent's compose file) means a path the backend computes for itself
    # (OUTPUTS_DIR) is also directly valid as the host-side mount source for worker
    # containers — no translation needed.
    OUTPUTS_DIR: str = os.getenv("OUTPUTS_DIR", "/outputs")
    SUBMISSIONS_DIR: str = os.getenv("SUBMISSIONS_DIR", "/submissions")
    PREVIEWS_DIR: str = os.getenv("PREVIEWS_DIR", "/previews")

    # Not named in the contract's env list, but required to fill in the SDK's
    # `AGENTMARKET_API` env var when launching a worker container — the base URL of *this*
    # backend, reachable from inside worker containers on the Docker network (contract §6:
    # "must be a Docker-network-resolvable name ... not localhost"). Defaults to the
    # in-compose service name; override for non-Docker setups.
    BACKEND_INTERNAL_URL: str = os.getenv("BACKEND_INTERNAL_URL", "http://backend:8000")

    # --- LLM provider passed through to worker containers (contract §6: xai only today) ---
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "xai")
    XAI_API_KEY: str = os.getenv("XAI_API_KEY", "")
    XAI_MODEL: str = os.getenv("XAI_MODEL", "grok-4")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    # --- SMTP / email ---
    SMTP_HOST: str = os.getenv("SMTP_HOST", "mailhog")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "1025"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASS: str = os.getenv("SMTP_PASS", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@agentmarket.local")
    SMTP_USE_TLS: bool = _bool("SMTP_USE_TLS", "false")

    FRONTEND_BASE_URL: str = os.getenv("FRONTEND_BASE_URL", "http://localhost:3001")

    # --- Misc ---
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    CORS_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
    ]


settings = Settings()
