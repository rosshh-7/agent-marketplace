# Agent Marketplace — Backend

FastAPI + SQLAlchemy + Postgres service implementing `PLATFORM_CONTRACT.md` §3–§7, §10:
customer/seller auth, agent browse, the hire flow (proxying `req-agent`), worker container
orchestration (Docker SDK), the SDK callback routes, seller submission review (proxying
`review-agent` from a background task), preview/download, and completion email.

## Project layout

```
app/
  main.py              FastAPI app, route registration, request logging middleware, startup seed
  config.py            All env vars, read once at import time
  database.py          SQLAlchemy engine/session, create_all()
  models.py            ORM models — one per PLATFORM_CONTRACT.md §3 table
  schemas.py            Pydantic request/response models
  security.py          Password hashing (passlib/bcrypt) + JWT issue/verify (two realms)
  deps.py              FastAPI dependencies: get_db, get_current_user, get_current_seller
  logging_setup.py     Structured stdout logging helpers
  seed.py              Startup seed for the HTML UI Builder listing
  routers/
    auth.py             /api/auth/*            (customer auth)
    seller_auth.py       /api/seller/auth/*      (seller auth)
    agents.py           /api/agents*            (public browse)
    jobs.py             /api/jobs*              (hire flow, status, preview, download, accept/reject)
    seller_agents.py    /api/seller/agents*      (seller upload/list/detail)
    callbacks.py        /jobs/{id}/progress, /jobs/{id}/complete  — UNPREFIXED, SDK callbacks
  services/
    req_agent_client.py     HTTP client for req-agent (port 8002)
    review_agent_client.py  HTTP client for review-agent (port 8010 / 8000 in-network)
    docker_launcher.py      Launches worker containers via the `docker` Python SDK
    email_service.py        SMTP completion email (Mailhog by default)
    task_spec.py             requirements -> task_spec mapping (contract §7)
```

To trace a request end-to-end: start in `main.py`'s route table comment, then the matching
router module, which calls into `services/` for anything that talks to another process. The
one thing to know about the async boundary: `routers/callbacks.py` is the *other* side of
`services/docker_launcher.py` — a worker container calls back into it independently of the
request that launched it.

## Running locally (outside Docker)

1. **Postgres.** Any local Postgres works; quickest is Docker:
   ```bash
   docker run -d --name agentmarket-postgres -p 5432:5432 \
     -e POSTGRES_USER=agentmarket -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=agentmarket \
     postgres:16
   ```

2. **Python env:**
   ```bash
   cd marketplace-platform/backend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Env vars.** Copy the block below into `marketplace-platform/backend/.env` (auto-loaded
   via `python-dotenv`) and adjust for your machine — defaults assume Docker-network service
   names, which won't resolve when running the backend bare-metal:
   ```bash
   DATABASE_URL=postgresql://agentmarket:localdev@localhost:5432/agentmarket
   JWT_SECRET=dev-secret-change-me
   REQ_AGENT_URL=http://localhost:8002
   REVIEW_AGENT_URL=http://localhost:8010
   AGENT_DOCKER_NETWORK=agentmarket-net
   OUTPUTS_DIR=/tmp/agentmarket-outputs
   SUBMISSIONS_DIR=/tmp/agentmarket-submissions
   PREVIEWS_DIR=/tmp/agentmarket-previews
   BACKEND_INTERNAL_URL=http://host.docker.internal:8001
   LLM_PROVIDER=xai
   XAI_API_KEY=...
   XAI_MODEL=grok-4
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_FROM=noreply@agentmarket.local
   FRONTEND_BASE_URL=http://localhost:3001
   CORS_ORIGINS=http://localhost:3001
   ```
   Create the three local directories referenced above (`mkdir -p /tmp/agentmarket-{outputs,submissions,previews}`)
   before starting the app.

4. **Tables.** No Alembic migration step for this POC — tables are created automatically on
   startup via `Base.metadata.create_all()` (see `app/database.py::init_db`). If you outgrow
   that, the models are already plain SQLAlchemy declarative classes, so wiring in Alembic
   later is `alembic init` + `alembic revision --autogenerate` against `app.database.Base` —
   no model changes needed.

5. **Run it:**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
   ```
   Visit `http://localhost:8001/health` — should return `{"status": "ok"}`. The startup seed
   creates the "HTML UI Builder" agent listing automatically; confirm with
   `curl http://localhost:8001/api/agents`.

6. **Upstream agents**, if you want the hire/upload flows to actually work end to end, need
   to be running separately per their own READMEs:
   ```bash
   # req-agent, port 8002
   cd req-agent && uvicorn api.server:app --host 0.0.0.0 --port 8002
   # review-agent, port 8010->8000
   cd review-agent && uvicorn app.main:app --host 0.0.0.0 --port 8010
   ```

7. **Worker containers** (launched via `docker run` by `services/docker_launcher.py`) need:
   - Docker available to the backend process (local Docker Desktop socket is fine outside a
     container — `docker.from_env()` finds it automatically).
   - A user-defined network named `agentmarket-net` (or whatever `AGENT_DOCKER_NETWORK` is
     set to) that the backend and every worker image can join:
     `docker network create agentmarket-net`.
   - The `agent-html-ui-builder` image actually built and tagged (a separate Docker Agent
     pass owns this — see `listing-agent/html-ui-builder/Dockerfile`, which can be built
     locally with `docker build -t agent-html-ui-builder listing-agent/html-ui-builder`).
   - `OUTPUTS_DIR` bind-mounted identically into the backend and every worker container —
     when running the backend bare-metal (not itself in a container), the "identity" bind
     mount is trivial: just point `OUTPUTS_DIR` at a real host directory
     (`/tmp/agentmarket-outputs` above) and `docker_launcher.py` mounts that same path into
     each worker container at `/outputs`.

## Running in Docker

`Dockerfile` builds the backend service alone:
```bash
docker build -t agentmarket-backend .
docker run -p 8001:8000 --env-file .env \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/agentmarket-outputs:/tmp/agentmarket-outputs \
  --network agentmarket-net \
  agentmarket-backend
```
Set `OUTPUTS_DIR=/tmp/agentmarket-outputs` (or any path) in `.env` and mount the *same* host
path into the container at the *same* path (the identity-bind-mount trick — see
`app/config.py::OUTPUTS_DIR` docstring and `review-agent/app/config.py` for the pattern this
mirrors). A top-level `docker-compose.yml` wiring all services + this mount + the shared
network together is expected from a separate Docker Agent pass, not owned by this backend.

## Environment variables

See `app/config.py` for the full list with defaults; the contract-specified ones are in
`PLATFORM_CONTRACT.md` §10. Two additions not named in the contract, needed to make worker
orchestration and preview unpacking concrete:
- `BACKEND_INTERNAL_URL` — fills the SDK's `AGENTMARKET_API` env var for launched worker
  containers (the contract describes the requirement but doesn't name a backend-side env
  var for it).
- `PREVIEWS_DIR` — where the completion callback unzips a job's result for static serving
  (contract §8 says "unzip it into a preview dir" but doesn't name the directory).

## Known deviations / assumptions (see code comments for the "why" at each site)

- **No Alembic** — `create_all()` at startup instead, for POC speed. Contract allows this
  explicitly ("Alembic preferred if time allows").
- **Preview/download accept a `?token=` query param** in addition to the `Authorization`
  header, on top of the header-only auth used everywhere else. Needed because
  `<iframe src=...>` and plain download links can't set custom headers — the contract lists
  these two routes as auth-required but doesn't specify a transport for browser-native
  requests, so this is the pragmatic bridge. Same JWT, same realm check, just accepted from
  two places.
- **Worker containers run with `auto_remove=True`.** Once a worker calls back to
  `/jobs/{id}/complete` there's nothing left to inspect on the happy path; if you need to
  debug a stuck/crashing worker, flip that to `False` in `services/docker_launcher.py` and
  use `docker logs job-<id>` before it exits.
