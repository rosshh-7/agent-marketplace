# Platform Contract — marketplace-platform

This is the authoritative interface contract between the frontend and backend of the
Agent Marketplace platform, and between the backend and the three existing autonomous
agents it orchestrates. Both the Frontend and Backend build tracks were handed this exact
file — do not deviate from it without updating it first, since the other side is building
against it independently and in parallel.

Read alongside (already exist in the repo root, do not modify unless stated):
- `AGENTMARKET_SPEC.md` — original architecture spec (Postgres schema ideas, phase history).
  This contract **supersedes** it on: no payment step, download-before-accept is allowed,
  and the exact route/env details below.
- `SELLER_GUIDE.md` — the contract *sellers* must follow when building an agent. Read this
  to understand what a worker agent submission looks like and what review-agent checks.
- `agentmarket_sdk/sdk.py` — the SDK every worker agent (including the one already built,
  `listing-agent/html-ui-builder/`) uses to talk to the platform. **This file is immutable
  from the backend's perspective** — third-party sellers' agents already call these exact
  URLs, so the backend must expose matching routes, not the other way around.
- `req-agent/` — requirement-gathering agent, a persistent FastAPI service (already built).
- `review-agent/` — seller-submission review agent, a persistent FastAPI service (already built).
- `listing-agent/html-ui-builder/` — the one worker agent that exists today. It builds a
  small static HTML site and zips it. This is the only hireable agent for the POC.

---

## 1. What already exists vs. what you are building

**Already built, do not rebuild, only integrate with (as HTTP clients from the backend):**
- `req-agent` — runs as its own container, port **8002**. Multi-turn requirement-gathering
  chat. API: see §4.
- `review-agent` — runs as its own container, port **8010** (maps to its internal 8000).
  Reviews a seller's `.zip`/`.tar.gz` submission (static analysis + sandboxed dynamic test runs +
  LLM judge) and returns an `APPROVE`/`FLAG`/`REJECT` verdict. API: see §5. **A single review
  call can take a while** (it builds a Docker image and runs sandboxed containers) — the
  backend must call it from a background task, never inline in a request handler.
- `listing-agent/html-ui-builder` — a worker agent: a **batch Docker container**, not a
  server. The backend launches one per hired job via `docker run`, using the SDK contract
  in §6. It builds a static site and calls back to the platform when done.

**You are building:**
- `marketplace-platform/backend/` — FastAPI app owning Postgres, auth, job orchestration,
  and being the HTTP server the SDK calls back into.
- `marketplace-platform/frontend/` — React + TypeScript + Webpack app for both the
  customer and seller journeys.
- (A separate Docker agent will containerize both of the above afterward — don't write the
  top-level `docker-compose.yml`, but do write your own `Dockerfile` per app if convenient;
  it may be replaced/adjusted by that pass.)

---

## 2. Explicitly dropped / changed from the original spec

- **No payment processing, not even mocked.** There is no "pay" step anywhere.
- **Download is never gated.** The customer can download the result `.zip` at any time once
  a job is `ready_for_review`, whether or not they've accepted or rejected it yet.
- **Accept / Reject are audit-trail actions only** — they record the customer's verdict on
  the job (`accepted_at`/`rejected_at`, optional rejection reason) and are shown in the
  dashboard. They do not change what the customer can download.
- **"Accepted" download is still just the same `.zip` file** — clicking Accept should trigger
  an automatic browser download of the result on the frontend (same file the preview/download
  button already serves).

---

## 3. Core entities (Postgres — owned entirely by the backend)

The backend owns this schema; the frontend never talks to Postgres directly.

```sql
users(id uuid pk, email text unique not null, password_hash text not null, created_at timestamptz)

sellers(id uuid pk, email text unique not null, password_hash text not null,
        company_name text, created_at timestamptz)

agents(id uuid pk, seller_id uuid null references sellers(id),  -- null = platform-owned
       name text, slug text unique, description text, category text,
       hourly_rate numeric(10,2), avg_hours numeric(5,2),
       image_name text not null,        -- docker image tag used to `docker run`
       status text default 'active',    -- active | pending_review | flagged | rejected | suspended
       card_copy text,                  -- marketing blurb, from review-agent on approval
       created_at timestamptz)

jobs(id uuid pk, user_id uuid references users(id), agent_id uuid references agents(id),
     req_session_id text,               -- session id from req-agent
     initial_brief text,
     task_spec jsonb,                   -- final structured spec handed to the worker container
     requirements_raw jsonb,            -- raw req-agent `requirements` extraction, kept for audit
     status text default 'gathering',   -- gathering | queued | running | ready_for_review | failed | accepted | rejected
     progress_pct numeric(5,2) default 0,
     progress_msg text,
     output_zip_path text,              -- path on the shared /outputs volume
     preview_path text,                 -- unzipped dir served statically for iframe preview
     customer_email text not null,
     rejection_reason text,
     created_at timestamptz, started_at timestamptz, completed_at timestamptz,
     accepted_at timestamptz, rejected_at timestamptz)

chat_messages(id uuid pk, job_id uuid references jobs(id),
              role text,                -- user | assistant
              content text, created_at timestamptz)   -- full audit trail of the hire conversation

seller_submissions(id uuid pk, seller_id uuid references sellers(id),
                    agent_id uuid null references agents(id),  -- set once approved & listed
                    name text, description text, category text,
                    hourly_rate numeric(10,2), avg_hours numeric(5,2),
                    tarball_path text not null,        -- permanent copy, kept for audit (backend's
                                                        -- own copy — separate from review-agent's,
                                                        -- which deletes its temp copy after use)
                    status text default 'pending',     -- pending | approved | flagged | rejected
                    review_result jsonb,               -- full ReviewOut payload from review-agent
                    created_at timestamptz, reviewed_at timestamptz)
```

Use SQLAlchemy + Alembic (or a startup `create_all` for POC speed — Alembic preferred if
time allows). Seed one row in `agents` on first startup for the HTML UI Builder
(`seller_id = NULL`, `image_name = 'agent-html-ui-builder'`, values from
`listing-agent/html-ui-builder/metadata.json`) so the marketplace isn't empty out of the box.

---

## 4. Backend REST API — customer + seller facing (frontend talks to this)

All routes below are prefixed `/api` **except** the two SDK callback routes in §6, which
must NOT be prefixed (hard constraint, see §6). Auth via `Authorization: Bearer <jwt>`.
Two separate auth realms — a user JWT cannot call seller routes and vice versa.

```
POST /api/auth/signup           {email, password}                 -> {token, user}
POST /api/auth/login            {email, password}                 -> {token, user}
GET  /api/auth/me                                                  -> user

POST /api/seller/auth/signup    {email, password, company_name}   -> {token, seller}
POST /api/seller/auth/login     {email, password}                 -> {token, seller}
GET  /api/seller/auth/me                                           -> seller

GET  /api/agents?category=&q=                                      -> [agent summary]
GET  /api/agents/{agent_id}                                         -> agent detail

# Hire flow — auth required (user)
POST /api/jobs/start            {agent_id, brief}
     -> creates job (status=gathering), opens a req-agent session, sends `brief` as the
        first message, logs both turns to chat_messages
     -> {job_id, message, phase}

POST /api/jobs/{job_id}/chat    {message}
     -> proxies to req-agent, logs both turns
     -> {message, phase}          # phase: "gathering" | "extracting" | "done"

POST /api/jobs/{job_id}/hire
     -> calls req-agent finalize, maps `requirements` -> task_spec (see §7), sets
        status=queued, then launches the worker container (§6) and sets status=running
     -> {job_id, status}

GET  /api/jobs                                                      -> [job summary] (mine)
GET  /api/jobs/{job_id}                                             -> job detail incl. progress
GET  /api/jobs/{job_id}/messages                                    -> full chat_messages audit trail

GET  /api/jobs/{job_id}/preview/                                    -> preview index (see §8)
GET  /api/jobs/{job_id}/preview/{path}                               -> static asset from the result
GET  /api/jobs/{job_id}/download                                    -> streams result .zip (no gating)
POST /api/jobs/{job_id}/accept                                       -> sets accepted_at/status
POST /api/jobs/{job_id}/reject  {reason?}                            -> sets rejected_at/status/reason

# Seller flow — auth required (seller)
POST /api/seller/agents/upload  multipart: name, description, category, hourly_rate,
                                 avg_hours, file=<.zip|.tar.gz|.tgz>
     -> persists tarball + seller_submissions row (status=pending), kicks off a background
        task that calls review-agent (§5), returns immediately
     -> {submission_id, status}

GET  /api/seller/agents                                              -> [submission summary] (mine)
GET  /api/seller/agents/{submission_id}                               -> full detail incl. review findings
```

Logging: structured request logging (method, path, status, latency, request id) to stdout;
also log every call out to req-agent/review-agent/worker containers and their outcome —
this is the main debugging surface once things are containerized.

---

## 5. Integrating with review-agent (seller submission review)

Base URL from env `REVIEW_AGENT_URL` (e.g. `http://review-agent:8000` inside Docker,
`http://localhost:8010` for local dev outside Docker).

```
POST {REVIEW_AGENT_URL}/review   multipart: source=<tarball>, name, description, category,
                                  hourly_rate, avg_hours
  -> ReviewOut: {id, verdict: APPROVE|FLAG|REJECT, reasoning[], findings[], test_results[],
                 quality_avg, pricing, card_copy, image_tag, ...}
```

This call blocks for the duration of the full review pipeline. Run it in a background task
(e.g. FastAPI `BackgroundTasks`, or a simple `asyncio.create_task` / thread pool — no need
for Celery/Redis at this scale) so `POST /api/seller/agents/upload` returns immediately with
`status=pending`. When the background task resolves:

- Update `seller_submissions.status` to `approved` / `flagged` / `rejected` (map from verdict)
  and store the full response in `review_result`.
- On `APPROVE`: create (or activate) the corresponding `agents` row using `image_tag` as
  `image_name` and `card_copy` from the response, status=`active`.
- On `FLAG`: leave `agents` untouched — surface findings in the seller dashboard for now,
  no auto-listing (a human-review step is out of scope for this build).
- On `REJECT`: no `agents` row; findings surfaced in the seller dashboard.

---

## 6. Integrating with worker agents (e.g. html-ui-builder) — the SDK contract

**This is the part that cannot be changed** — `agentmarket_sdk/sdk.py` is baked into every
worker agent's image, including third-party seller submissions already reviewed and running.
The backend must match it exactly, not the reverse.

The SDK reads these env vars, set by the backend when it does `docker run`:
- `AGENTMARKET_API` — base URL of the backend, reachable *from inside the worker container*.
  In Docker this must be a Docker-network-resolvable name (e.g. `http://backend:8000`), not
  `localhost`. The worker container must be attached to the same user-defined network as the
  backend — this is a Docker Agent concern, but the backend's `docker run` invocation must
  pass `--network <that network>`. Make the network name configurable via env
  (`AGENT_DOCKER_NETWORK`, default `agentmarket-net`).
- `JOB_ID` — the job's UUID.
- `TASK_SPEC` — JSON string, the task spec (§7).
- `LLM_PROVIDER=xai`, `XAI_API_KEY`, `XAI_MODEL` — this platform uses Grok/xAI for every
  agent's own generation calls. Pass these three through from backend env/config.
- Worker also needs `/outputs` to be a **shared volume** between the worker container and
  the backend container, at the identical absolute path (same trick `review-agent` already
  uses for `DYNAMIC_TEST_OUTPUTS_DIR` — see `review-agent/app/config.py` comments). The SDK's
  `upload_file()`/`complete()` write to `/outputs/{JOB_ID}/...` inside the worker container;
  the backend needs to read that same file at the same path after `complete()` fires.
  Use env `OUTPUTS_DIR` (default `/outputs`) on the backend side, and bind-mount the same
  host path into every worker container the backend launches.

The SDK calls back to these **unprefixed** routes (no `/api`) — implement them exactly:

```
PATCH /jobs/{job_id}/progress    {pct: float 0..1, message: str}
     -> update jobs.progress_pct/progress_msg. No auth (trusted Docker-network callers only).

POST  /jobs/{job_id}/complete    {output_path: str}
     -> output_path is the path *inside the worker container* (e.g. /outputs/{job_id}/site.zip),
        which is the same path on the backend's side too (identical bind mount, see above).
     -> unzip it into a preview dir (§8), set status=ready_for_review, completed_at=now,
        output_zip_path, preview_path, then send the completion email (see below) to
        jobs.customer_email.
```

**Launching the container:** backend runs (via the `docker` Python SDK, not shelling out —
same library review-agent already depends on, check its `requirements.txt`) roughly:
```
docker run -d --network agentmarket-net \
  -e AGENTMARKET_API=http://backend:8000 -e JOB_ID=<id> -e TASK_SPEC='<json>' \
  -e LLM_PROVIDER=xai -e XAI_API_KEY=... -e XAI_MODEL=grok-4 \
  -v <host_outputs_dir>:/outputs \
  <agents.image_name>
```
This requires the backend container to have `/var/run/docker.sock` mounted, same pattern as
`review-agent`'s `docker-compose.yml` — flag this for the Docker Agent pass, but don't block
on it: write the code assuming the socket is available.

**Email on completion:** SMTP via env `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` (optional),
`SMTP_PASS` (optional), `SMTP_FROM`. Defaults point at a local Mailhog
(`SMTP_HOST=mailhog`, `SMTP_PORT=1025`, no auth) for dev. Email body links to
`{FRONTEND_BASE_URL}/dashboard/jobs/{job_id}`.

---

## 7. Mapping req-agent's `requirements` output to a worker `task_spec`

req-agent's finalize returns a generic requirements-doc shape (`project_name`,
`project_overview`, `goals[]`, `functional_requirements[]`, `constraints[]`, etc. — see
`req-agent/api/server.py::_to_markdown` for the full shape). Worker agents (see
`listing-agent/html-ui-builder/agent.py`) expect a flatter `task_spec`:
`deliverable, topic, tone, audience, constraints[], count, pages[], customer_email`.

The backend must synthesize the `task_spec` after finalize, e.g.:
```python
task_spec = {
    "job_id": job.id,
    "task_type": "content",  # or map from agent.category
    "deliverable": requirements.get("project_overview") or requirements.get("project_name"),
    "topic": "; ".join(requirements.get("goals", [])),
    "tone": "clean and professional",  # no strong signal from req-agent today — fine to default
    "audience": next(iter(requirements.get("stakeholders", [])), "general visitors"),
    "constraints": requirements.get("constraints", []),
    "count": len(requirements.get("functional_requirements", [])) or 1,
    "customer_email": job.customer_email,
}
```
Store both the raw `requirements` (in `requirements_raw`) and the derived `task_spec` — the
raw copy is the audit trail, the derived one is what actually gets sent to the worker. This
mapping is a reasonable default, not a hard spec — keep it in one function so it's easy to
improve later without touching orchestration logic.

---

## 8. Preview mechanism (frontend requirement)

The worker's result is a `.zip` of a static site (`index.html` + other pages/assets). On
`complete()`, the backend unzips it to a `preview_path` directory and serves it as static
files at `GET /api/jobs/{job_id}/preview/{path}` (FastAPI `StaticFiles`, or a manual
file-serving route — StaticFiles is fine here). The frontend's review page renders this in
an `<iframe src="/api/jobs/{job_id}/preview/index.html">` (proxy through the frontend dev
server / same-origin in prod so relative links inside the site resolve correctly).

`GET /api/jobs/{job_id}/download` serves the original `.zip` as an attachment — always
available once `status` is `ready_for_review` or later (see §2, no gating).

---

## 9. Frontend routes (React Router)

```
/                              Browse agents (grid, search/filter by category)
/agents/:agentId               Agent detail + "describe your task" box + Hire button
/login  /signup                Customer auth
/dashboard                     List of my jobs with status chips
/dashboard/jobs/:jobId          Unified job view — renders differently by status:
                                  gathering  -> chat UI with req-agent, "I'm done, hire" button
                                  queued/running -> progress bar + live-ish polling
                                  ready_for_review/accepted/rejected -> iframe preview,
                                    Accept / Reject buttons, Download button (always enabled)

/seller/login  /seller/signup  Seller auth
/seller/dashboard              List of my submissions with status chips
/seller/agents/new             Upload form: metadata fields + .zip/.tar.gz file input
/seller/agents/:submissionId   Submission detail: status + review findings/test results
```

Poll `GET /api/jobs/{job_id}` every few seconds while status is `gathering`(no—chat is
interactive, no polling needed there)/`queued`/`running`; stop polling once terminal
(`ready_for_review`/`accepted`/`rejected`/`failed`). Same polling pattern for seller
submission status while `pending`.

Service/API layer: one client module per resource
(`src/api/{auth,agents,jobs,sellerAuth,seller}.ts`) wrapping `fetch`, attaching the bearer
token from a small auth context/hook. No Redux — context + hooks is enough at this scope.

---

## 10. Environment variables (backend)

```
DATABASE_URL=postgresql://agentmarket:localdev@postgres:5432/agentmarket
JWT_SECRET=...
REQ_AGENT_URL=http://req-agent:8002
REVIEW_AGENT_URL=http://review-agent:8000
AGENT_DOCKER_NETWORK=agentmarket-net
OUTPUTS_DIR=/outputs
SUBMISSIONS_DIR=/submissions        # permanent tarball storage for audit trail
LLM_PROVIDER=xai
XAI_API_KEY=...
XAI_MODEL=grok-4
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_FROM=noreply@agentmarket.local
FRONTEND_BASE_URL=http://localhost:3001
```

Frontend build-time env: `API_BASE_URL` (webpack `DefinePlugin`/`.env`), default
`http://localhost:8001`.

---

## 11. Division of responsibility (for the two build tracks)

- **Backend track** owns: everything in §3, §4, §5, §6, §7, §10, plus its own `Dockerfile`
  (don't write the top-level compose).
- **Frontend track** owns: §9, its own `Dockerfile`/webpack prod build (don't write the
  top-level compose), and must build against the exact API shapes in §4 — if a shape is
  ambiguous, prefer matching this doc over guessing, and note the assumption in a code
  comment rather than blocking.
- **Neither track modifies** `req-agent/`, `review-agent/`, `listing-agent/`,
  `agentmarket_sdk/`, or root-level docs — those are frozen inputs.
