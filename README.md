# Agent Marketplace — running the whole platform

This is the top-level Docker wiring for the platform described in
`marketplace-platform/PLATFORM_CONTRACT.md`: a FastAPI backend, a React/Webpack frontend
(served via nginx), two already-built persistent agents (`req-agent`, `review-agent`), and
one on-demand worker agent (`listing-agent/html-ui-builder`) that the backend launches per
hired job via the Docker SDK.

## Prerequisites

- Docker Desktop (or another Docker Engine + Compose v2 setup). Tested with Docker Desktop
  4.73 / Compose v5.1.3 on macOS.
- An [xAI API key](https://x.ai/) (`XAI_API_KEY`) if you want req-agent, review-agent, and
  the worker agent to actually generate anything — see **Known limitations** below. Without
  one, the stack still comes up cleanly, but req-agent will crash-loop (its LLM client is
  constructed at import time and needs a non-empty key string) and any hired job will fail
  to generate real content.
- Nothing else needs to be installed locally — everything (Postgres, the agents, the
  frontend build) runs inside containers.

## One-time setup

```bash
git clone <this repo>   # or just cd into your existing checkout
cd agent-marketplace

cp .env.example .env
# Edit .env:
#   - set a real XAI_API_KEY (and optionally ANTHROPIC_API_KEY for review-agent's judge)
#   - update OUTPUTS_DIR / DYNAMIC_TEST_OUTPUTS_DIR if this repo is NOT checked out at
#     /Users/roshan/roshan/code/agent-marketplace (see the comments in .env.example —
#     these must be real absolute paths on THIS host, under a directory Docker Desktop is
#     allowed to bind-mount, e.g. under your home directory; a literal root path like
#     `/outputs` will be rejected by Docker Desktop's file-sharing allowlist)
```

## Bring the whole stack up

Worker agent images are **not** part of `docker compose up` — they're not long-running
services, the backend launches one container per hired job on demand (see
`marketplace-platform/backend/app/services/docker_launcher.py`), and its DB seed hardcodes
the image tag `agent-html-ui-builder` (`marketplace-platform/backend/app/seed.py`). Build it
once, first:

```bash
./scripts/build-agents.sh      # or: make build-agents
```

Then bring up everything else:

```bash
docker compose up --build -d
```

(`make up` does both steps in order.) First build takes a few minutes (Postgres/Mailhog
images pull, the four app images build). Check status with:

```bash
docker compose ps
docker compose logs -f          # all services
docker compose logs -f backend  # one service
```

Tear down with `docker compose down` (add `-v` to also drop the Postgres/review-agent/
submissions/previews named volumes for a fully clean slate).

## Ports

| Service | Container port | Host port (default) | What it is |
|---|---|---|---|
| frontend | 80 (nginx) | **3000** | React SPA — start here: http://localhost:3000 |
| backend | 8000 | **8000** | FastAPI — REST API + SDK callback routes. `/health`, `/api/...` |
| req-agent | 8002 | **8002** | Requirement-gathering chat service (standalone, frozen input) |
| review-agent | 8000 | **8010** | Seller-submission review service (standalone, frozen input) |
| mailhog | 8025 (UI) / 1025 (SMTP) | **8025** / **1025** | Inspect completion emails at http://localhost:8025 |
| postgres | 5432 | **5432** | Owned entirely by the backend; exposed for local psql/GUI convenience only |

Every host port above is overridable via `.env` (`BACKEND_PORT`, `FRONTEND_PORT`,
`REQ_AGENT_PORT`, `REVIEW_AGENT_PORT`, `MAILHOG_SMTP_PORT`, `MAILHOG_UI_PORT`,
`POSTGRES_PORT`) if any default is already taken on your machine — see the commented-out
block at the bottom of `.env.example`. If you change `BACKEND_PORT` or `FRONTEND_PORT`,
also update `API_BASE_URL` / `FRONTEND_BASE_URL` to match, since those are consumed by the
browser, not by other containers.

## How the pieces are wired together

- All six compose services (`postgres`, `mailhog`, `backend`, `frontend`, `req-agent`,
  `review-agent`) join one user-defined bridge network, **`agentmarket-net`** — this exact
  name is forced via the `networks:` block's `name:` key (not Compose's default
  project-prefixed name), because the backend also passes it as `--network` when it
  launches worker containers directly against the host Docker daemon, *outside* Compose's
  own service graph (`AGENT_DOCKER_NETWORK` env var, contract §6). Worker containers reach
  the backend at `http://backend:8000` this way.
- `backend` has `/var/run/docker.sock` mounted so it can launch worker containers via the
  Python `docker` SDK (`docker.from_env()` picks the socket up automatically) — the same
  pattern `review-agent` already uses for its own sandboxed submission-test containers.
- **Identity bind-mount #1 — `OUTPUTS_DIR`.** Worker containers write their result to
  `/outputs/{job_id}/...`, a path hardcoded into every worker image via
  `agentmarket_sdk/sdk.py` (frozen — cannot be changed, even for third-party seller
  submissions already reviewed). The backend calls the *host* Docker daemon (via the
  mounted socket) to launch each worker, so the bind-mount source it hands `docker run` is
  resolved on the real host filesystem — verified directly against
  `backend/app/services/docker_launcher.py`, which does
  `volumes={settings.OUTPUTS_DIR: {"bind": "/outputs"}}` for every worker it starts.
  `docker-compose.yml` mounts that same host directory into the **backend's own**
  container at the same fixed path (`/outputs`), so after a worker calls back to
  `POST /jobs/{id}/complete`, the backend can open the exact file the worker just wrote.
  `OUTPUTS_DIR` itself just needs to be a real absolute path Docker Desktop is allowed to
  share (true root-level paths like `/outputs` are rejected — see `.env.example`).
- **Identity bind-mount #2 — `DYNAMIC_TEST_OUTPUTS_DIR`.** Same trick, already implemented
  in `review-agent`'s own `docker-compose.yml`/`app/config.py`: review-agent launches
  short-lived sandboxed containers on the host daemon to dynamic-test a seller submission,
  and needs to read their output back. Unlike `OUTPUTS_DIR`, review-agent's own code
  references this env var directly to build paths, so source and target are mounted at the
  *textually identical* path (`${DYNAMIC_TEST_OUTPUTS_DIR}:${DYNAMIC_TEST_OUTPUTS_DIR}`).
- `SUBMISSIONS_DIR` and `PREVIEWS_DIR` are backend-internal only (no other container ever
  reads them), so they're backed by plain named volumes (`submissions_data`,
  `previews_data`) — no identity-mount trick needed.
- The frontend is a static SPA served by nginx with **no runtime `/api` proxy** (see
  `marketplace-platform/frontend/nginx.conf`) — `API_BASE_URL` is baked into the JS bundle
  at *build* time as an absolute, browser-reachable URL (`http://localhost:8000` by
  default), not the Docker-network service name `http://backend:8000` (which only resolves
  for other containers, not code running in the user's browser).

## Verifying it's up

```bash
curl http://localhost:8000/health              # {"status":"ok"}
curl http://localhost:8000/api/agents          # [{"name":"HTML UI Builder", ...}] — seeded on backend startup
curl http://localhost:8002/health              # {"status":"ok"}  (req-agent)
curl -o /dev/null -w '%{http_code}\n' http://localhost:8010/docs   # 200 (review-agent, no dedicated /health route)
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/       # 200 (frontend index.html)
open http://localhost:8025                      # Mailhog UI — completion emails land here
```

## Known limitations

- **Needs a real `XAI_API_KEY`** for req-agent, review-agent's judge (or a real
  `ANTHROPIC_API_KEY`, its default provider), and every worker agent (the html-ui-builder)
  to actually generate anything. Without one:
  - `req-agent` **crash-loops** — `req-agent/agent/nodes.py` constructs its LLM client at
    *import* time, and the underlying OpenAI-compatible client rejects a missing/empty API
    key immediately (not just at call time). A syntactically-shaped-but-fake key (any
    non-empty string) is enough to let the container start; real requirement-gathering
    conversations still need a working key.
  - `review-agent` starts fine (its LLM client is constructed lazily), but any actual
    `/review` call will fail once it reaches the judge step.
  - The worker container will fail before calling back to `/jobs/{id}/complete`, so a hired
    job will get stuck in `running` rather than reaching `ready_for_review`.
- ~~The worker agent's own `complete()` call reports a `.md` file, not the site `.zip`.~~
  **Fixed** in `agentmarket_sdk/sdk.py` (and synced to its two vendored copies,
  `review-agent/app/vendor/agentmarket_sdk/` and `seller-kit/agentmarket_sdk/` — all three
  must stay identical per `agentmarket_sdk/README.md`): `upload_file()` now records the last
  path it copied to `/outputs/`, and `complete()` reports that path automatically when no
  explicit `output_path` is passed and no text content was written. Text-only agents that
  never call `upload_file()` are unaffected — they still get the original `result.md`
  behavior. `agent-html-ui-builder` was rebuilt (`./scripts/build-agents.sh`) with the fix
  baked in, so a hired job now reaches `ready_for_review` with the actual site `.zip`
  referenced, unzipped, and previewable/downloadable — not just the markdown summary.
- **Docker-in-Docker via the host socket.** Both `backend` and `review-agent` share the
  *host's* Docker daemon (via `/var/run/docker.sock`), same as documented in
  `review-agent`'s own README — fine for a local POC, not an isolation boundary you'd want
  in a real multi-tenant production deployment (a compromised worker submission could in
  principle interact with the same daemon everything else runs on).
- **Ports assume a clean host.** Defaults match `PLATFORM_CONTRACT.md` exactly (backend
  8000, frontend 3000, req-agent 8002, review-agent 8010, Postgres 5432, Mailhog 1025/8025).
  If something else on your machine already holds one of these, override the corresponding
  `*_PORT` variable in `.env` rather than editing `docker-compose.yml` (see **Ports** above).
- **No Alembic / migrations** — the backend uses a startup `create_all()` (documented, and
  explicitly allowed by the contract for this scope).

## Repo layout relevant to this Docker wiring

```
docker-compose.yml              top-level orchestration (this README's subject)
.env.example                    every env var consumed anywhere in the stack, grouped by service
scripts/build-agents.sh         builds + tags the on-demand worker agent image(s)
Makefile                        `make build-agents` / `make up` / `make down` / `make logs` / `make ps`
marketplace-platform/
  PLATFORM_CONTRACT.md          the authoritative spec this wiring implements
  backend/                      FastAPI service (own Dockerfile, built by docker-compose.yml)
  frontend/                     React/Webpack app, built + served via nginx (own Dockerfile)
req-agent/                      standalone requirement-gathering service (frozen; own Dockerfile reused here)
review-agent/                   standalone submission-review service (frozen; own Dockerfile reused here)
listing-agent/html-ui-builder/  the one worker agent — NOT a compose service, see scripts/build-agents.sh
agentmarket_sdk/                SDK every worker agent (incl. html-ui-builder) imports (frozen)
```
