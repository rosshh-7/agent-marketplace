import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("REVIEW_AGENT_DATA_DIR", APP_DIR.parent / "data"))
DATABASE_PATH = DATA_DIR / "reviews.db"

# LLM provider used for the review agent's own judge calls (prompt-safety audit, quality
# scoring, card copy). Defaults to Anthropic per the marketplace spec's decided stack;
# set LLM_PROVIDER=xai or LLM_PROVIDER=groq to swap providers (e.g. when an Anthropic key
# isn't on hand for a local POC run). Switching back is a one-line env change, no code change.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
JUDGE_MODEL = os.getenv("REVIEW_JUDGE_MODEL", "claude-sonnet-4-6")

XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_MODEL = os.getenv("XAI_MODEL", "grok-4")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Host-side path for dynamic-test output volumes. review-agent runs the Docker SDK against
# the *host* daemon (via the mounted docker.sock) to launch sibling test containers, so any
# bind-mount source it hands the API is resolved on the real host filesystem — not inside
# review-agent's own container. This must be the same absolute path on both sides (see the
# identical bind mount in docker-compose.yml) so a path review-agent computes for itself is
# also valid as the host-side mount source it gives to sibling containers. Defaults to the
# system temp dir, which is correct when review-agent itself runs bare-metal (e.g. via
# review_cli.py) rather than inside its own container.
DYNAMIC_TEST_OUTPUTS_DIR = os.getenv("DYNAMIC_TEST_OUTPUTS_DIR") or None

# Docker sandbox limits for dynamic test runs. Lightweight for the POC — no network
# egress lockdown yet. See README for the hardening follow-up.
CONTAINER_MEM_LIMIT = os.getenv("REVIEW_CONTAINER_MEM_LIMIT", "512m")
CONTAINER_NANO_CPUS = int(os.getenv("REVIEW_CONTAINER_NANO_CPUS", str(1_000_000_000)))  # 1 CPU
CONTAINER_PIDS_LIMIT = int(os.getenv("REVIEW_CONTAINER_PIDS_LIMIT", "128"))
CONTAINER_TIMEOUT_SECONDS = int(os.getenv("REVIEW_CONTAINER_TIMEOUT_SECONDS", "60"))
BUILD_TIMEOUT_SECONDS = int(os.getenv("REVIEW_BUILD_TIMEOUT_SECONDS", "300"))

# Docker needs these at the root of the build context — not negotiable. The entrypoint
# script and the system prompt (prompts.py) are instead discovered anywhere in the tree
# (see intake._discover_entrypoint / _discover_prompts) so submissions using a normal
# Python package layout (e.g. main.py + agent/nodes.py) don't get rejected on structure
# alone. See ../SELLER_GUIDE.md for the contract sellers are expected to follow.
REQUIRED_ROOT_FILES = ["requirements.txt", "Dockerfile"]

# Fallback entrypoint filename if the Dockerfile's CMD/ENTRYPOINT doesn't name a .py file.
DEFAULT_ENTRYPOINT_NAME = "agent.py"
PROMPTS_FILENAME = "prompts.py"

# Static analysis: import/call names that are an automatic critical finding.
DANGEROUS_CALLS = {
    "os.system", "os.popen", "os.execv", "os.execve", "os.execl",
    "subprocess.Popen", "subprocess.call", "subprocess.run", "subprocess.check_output",
    "eval", "exec", "compile",
    "socket.socket",
    "ctypes.CDLL", "ctypes.cdll",
    "pty.spawn",
}

# Dockerfile patterns that are an automatic critical finding.
DANGEROUS_DOCKERFILE_PATTERNS = [
    r"curl[^\n]*\|\s*(sh|bash)",
    r"wget[^\n]*\|\s*(sh|bash)",
    r"^\s*ADD\s+https?://",
    r"--privileged",
    r"COPY\s+\.\./",
    r"ADD\s+\.\./",
]

# Regex for secret-shaped strings hardcoded in source (rough heuristic for POC).
SECRET_PATTERNS = [
    r"sk-ant-[A-Za-z0-9\-_]{20,}",
    r"sk-[A-Za-z0-9]{32,}",
    r"AKIA[0-9A-Z]{16}",
    r"(?i)(api[_-]?key|secret|token|password)\s*=\s*[\"'][A-Za-z0-9+/=_\-]{16,}[\"']",
]

# Per-category $/hour baseline ranges used for pricing sanity checks. Small static
# table for the POC — replace with real marketplace data once agents have a track record.
CATEGORY_PRICE_BASELINES = {
    "content": (10.0, 40.0),
    "research": (15.0, 50.0),
    "code": (20.0, 80.0),
    "data": (15.0, 60.0),
    "email": (8.0, 30.0),
}
DEFAULT_PRICE_BASELINE = (10.0, 60.0)

# Decision thresholds.
QUALITY_SCORE_APPROVE_MIN = 7.0   # out of 10, average across golden runs
QUALITY_SCORE_FLAG_MIN = 5.0      # below this -> reject, between this and APPROVE_MIN -> flag
PRICING_OUTLIER_RATIO = 1.5       # measured $/hr more than this multiple outside baseline -> flag

CANARY_SECRET_VALUE = "CANARY-7f3a9c2e-do-not-leak"
