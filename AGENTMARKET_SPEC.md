# Agent Marketplace — POC Build Spec

> Feed this file to Claude Code at the start of every session.
> It contains all architectural decisions, phase tasks, stack choices, and code patterns agreed upon.
> Do not deviate from decisions marked **[DECIDED]** without flagging it first.

---

## What We Are Building

An AI agent marketplace where:
- **Sellers** list autonomous AI agents with an hourly rate
- **Customers** browse agents, brief them with context, and the agent works in the background
- When the task is done the customer gets an email notification, reviews the output, accepts it, pays, and downloads
- Customers **cannot download before accepting and paying**

The POC runs **entirely locally** — no cloud services, no AWS, no S3, no ECS.

---

## North Star Principles

1. **Prove before polish** — working agent first, UI later
2. **Local everything** — Docker Compose replaces all cloud infra for the POC
3. **One agent, one job at a time** — no concurrency complexity in Phase 1
4. **Platform owns execution** — agents run in containers the platform controls, sellers just write Python
5. **No payment processing in POC** — accept button marks job as paid, real Stripe comes later

---

## Current Phase

**Phase 1 — Bare Python agent** (start here)

Do not jump ahead. Complete and verify each phase before starting the next.

---

## All Phases

### Phase 1 — Bare Python agent
Goal: Prove the agent logic works end-to-end before touching any infra.

- [ ] Set up Python 3.12 virtual environment and install dependencies
- [ ] Write Platform SDK stub — local module with `task_input()` and `complete()`
- [ ] Write a simple content-writing agent using LangGraph (plan → write → complete)
- [ ] Add `web_search` tool using Tavily API
- [ ] Create a sample `task_spec.json` to simulate platform input
- [ ] Run `python agent.py` and verify output appears in `/outputs/`
- [ ] Test edge cases: long output, tool failure, empty brief

### Phase 2 — Containerise the agent
Goal: Same agent, same output — but running inside Docker.

- [ ] Write `Dockerfile` for the agent
- [ ] Mount `/outputs` as a Docker volume
- [ ] Inject `task_spec.json` and `ANTHROPIC_API_KEY` as environment variables at `docker run`
- [ ] Build: `docker build -t agent-content .`
- [ ] Run: `docker run --env-file .env -v $(pwd)/outputs:/outputs agent-content`
- [ ] Verify identical output to bare Python run

### Phase 3 — Local infrastructure
Goal: Spin up all supporting services with one `docker compose up`.

- [ ] Write `docker-compose.yml` (Postgres, Redis, Mailhog, FastAPI, Celery worker)
- [ ] FastAPI backend: `POST /jobs`, `GET /jobs/:id`, `GET /agents`
- [ ] Postgres schema: `agents` table, `jobs` table
- [ ] Celery worker: picks up job, runs `docker run` for the correct agent image
- [ ] Update Platform SDK: POST progress updates back to the API
- [ ] Wire Mailhog: API sends SMTP email on job completion
- [ ] End-to-end test: `POST /jobs` → Celery → container → output → email in Mailhog

### Phase 4 — Requirement gatherer agent
Goal: The entry point every customer uses. Must work before any UI is built.

- [ ] Write requirement gatherer as a separate LangGraph agent (multi-turn conversation loop)
- [ ] Gap detection: classify task type, identify missing fields, ask max 3 questions per round
- [ ] Structured output: produces a `task_spec` JSON (intent, deliverable, constraints, tone, deadline)
- [ ] Estimator: complexity rubric maps task spec fields to estimated hours and cost range
- [ ] Agent matching: returns list of available agents sorted by category fit
- [ ] Containerise using the same Dockerfile pattern from Phase 2
- [ ] Test via API: `POST /gather` with raw brief → returns task_spec + estimate + matched agents

### Phase 5 — Basic marketplace UI
Goal: Minimal frontend to run the demo. Functional, not polished.

- [ ] Set up React app (Vite + Tailwind) connected to FastAPI
- [ ] Agent listing page: show the one agent card (name, description, rate, availability)
- [ ] Hire flow: customer selects agent → chat UI with requirement gatherer → shows estimate → confirm
- [ ] Task dashboard: job status (queued / in progress with % / ready for review)
- [ ] Review page: output preview + total cost + accept button
- [ ] Mock payment: accept button marks job as paid (no real payment for POC)
- [ ] Download: serve output file from `/outputs/` via backend endpoint after payment
- [ ] Seller form: register an agent listing (name, description, rate, Docker image name)

### Phase 6 — End-to-end demo
Goal: A real person completes the full flow from hire to download without manual intervention.

- [ ] Register content-writing agent as the first listing via seller form
- [ ] Full run: browse → brief → confirm → wait → email in Mailhog → review → accept → download
- [ ] Verify billing: estimated cost matches actual hours × rate on review screen
- [ ] Record or run live — this is the POC checkpoint. Do not proceed to Phase 7 until this works.

### Phase 7 — Review agent
Goal: Gate for untrusted sellers. Only needed when real third-party sellers start listing.

- [ ] Review agent reads seller's system prompt + runs synthetic test prompts
- [ ] Scoring: output quality, pricing sanity, system prompt safety audit
- [ ] Output: approve / approve-with-edits / reject + reason + auto-generated marketplace card copy
- [ ] Wire into seller listing flow: listings go live only on approval
- [ ] Test: submit your own agent through the review flow and verify it passes

---

## Project File Structure

```
agentmarket/
│
├── agents/
│   ├── content-writer/
│   │   ├── agent.py              # LangGraph agent logic
│   │   ├── tools.py              # Tool definitions (@tool decorated functions)
│   │   ├── prompts.py            # System prompt and node prompts
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── requirement-gatherer/
│       ├── agent.py
│       ├── estimator.py          # Complexity rubric + cost calculation
│       ├── Dockerfile
│       └── requirements.txt
│
├── sdk/
│   └── agentmarket_sdk/
│       ├── __init__.py
│       ├── sdk.py                # task_input(), complete(), set_progress(), log()
│       └── stub.py               # Local stub for Phase 1 (reads/writes local files)
│
├── backend/
│   ├── main.py                   # FastAPI app
│   ├── models.py                 # Pydantic models
│   ├── database.py               # SQLAlchemy + Postgres connection
│   ├── routers/
│   │   ├── agents.py             # GET /agents, POST /agents
│   │   ├── jobs.py               # POST /jobs, GET /jobs/:id
│   │   └── gather.py             # POST /gather
│   ├── worker.py                 # Celery app + task definitions
│   └── email.py                  # Mailhog SMTP sender
│
├── ui/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Browse.tsx        # Agent listing page
│   │   │   ├── Hire.tsx          # Requirement gatherer chat + estimate
│   │   │   ├── Dashboard.tsx     # Customer task status
│   │   │   ├── Review.tsx        # Output preview + accept + download
│   │   │   └── SellerList.tsx    # Seller agent registration form
│   │   ├── components/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── outputs/                      # Agent output files land here (mounted as Docker volume)
├── task_specs/                   # Sample task_spec.json files for testing
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Stack — DECIDED, Do Not Change

| Layer | Choice | Reason |
|---|---|---|
| Agent language | Python 3.12 | LangGraph and Anthropic SDK are Python-first |
| Agent framework | LangGraph | Stateful graph, handles loops, resumable |
| LLM | Anthropic Claude (claude-sonnet-4-6) | Direct SDK, no abstraction layer needed for POC |
| Web search tool | Tavily API | Free tier, returns structured results |
| Task queue | Celery + Redis | Standard, runs locally in Docker |
| Database | Postgres | Job state, agent listings |
| Backend | FastAPI (Python) | Same language as agents, fast to write |
| Frontend | React + Vite + Tailwind | Standard, fast setup |
| Local email | Mailhog | Catches all SMTP locally, view at localhost:8025 |
| Container runtime | Docker | Agent containers run via `docker run` from Celery worker |
| Output storage | Local filesystem `/outputs/` | Replaces S3 for POC |
| Payment | Mock (button click) | Replaces Stripe for POC |

**Not used in POC:** AWS S3, ECS, EKS, ECR, SendGrid, Resend, Stripe, LiteLLM, CrewAI.

---

## Platform SDK — Contract Between Agent and Platform

Every agent communicates with the platform exclusively through the SDK.
Agents must not make direct HTTP calls, write outside `/workspace/`, or access env vars other than `TASK_SPEC` and `ANTHROPIC_API_KEY`.

```python
# sdk/agentmarket_sdk/sdk.py

import os, json, requests

API_BASE = os.getenv("AGENTMARKET_API", "http://localhost:8000")
JOB_ID   = os.getenv("JOB_ID")

def task_input() -> dict:
    """Returns the task spec dict. In Phase 1 stub reads from TASK_SPEC env var or local file."""
    raw = os.getenv("TASK_SPEC")
    if raw:
        return json.loads(raw)
    with open("task_spec.json") as f:        # Phase 1 fallback
        return json.load(f)

def set_progress(pct: float, message: str = "") -> None:
    """0.0 to 1.0. Platform stores this and streams to customer dashboard."""
    try:
        requests.patch(f"{API_BASE}/jobs/{JOB_ID}/progress",
                       json={"pct": round(pct, 2), "message": message}, timeout=3)
    except Exception:
        print(f"[progress] {int(pct*100)}% — {message}")   # fallback for Phase 1

def log(message: str) -> None:
    print(f"[agent] {message}")

def complete(result: dict) -> None:
    """Call this once at the end. Triggers email notification and billing stop."""
    output_path = f"/outputs/{JOB_ID or 'local'}/result.md"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    content = result.get("content", str(result))
    with open(output_path, "w") as f:
        f.write(content)
    try:
        requests.post(f"{API_BASE}/jobs/{JOB_ID}/complete",
                      json={"output_path": output_path}, timeout=5)
    except Exception:
        print(f"[complete] Output written to {output_path}")

def upload_file(local_path: str) -> str:
    """For Phase 1 POC: just copies file to /outputs/. Returns the destination path."""
    import shutil
    dest = f"/outputs/{JOB_ID or 'local'}/{os.path.basename(local_path)}"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(local_path, dest)
    return dest
```

---

## Agent Pattern — LangGraph Template

All agents follow this exact structure. Copy this for every new agent.

```python
# agents/content-writer/agent.py

from agentmarket_sdk import sdk
from langgraph.graph import StateGraph, END
from anthropic import Anthropic
from typing import TypedDict, List
from tools import web_search, write_file

client = Anthropic()

# ── 1. State schema ──────────────────────────────────────────────
class AgentState(TypedDict):
    task: dict
    messages: List[dict]
    drafts: List[str]
    current_draft: int
    done: bool

# ── 2. Node functions (one per step) ─────────────────────────────
def plan(state: AgentState) -> AgentState:
    sdk.set_progress(0.05, "Planning approach...")
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system=open("prompts.py").read(),   # or inline string
        messages=[{"role": "user", "content": f"Plan this task: {state['task']}"}]
    )
    sdk.log("Plan complete")
    return {"messages": state["messages"] + [{"role": "assistant", "content": response.content[0].text}]}

def research(state: AgentState) -> AgentState:
    sdk.set_progress(0.2, "Researching...")
    results = web_search(state["task"].get("topic", ""))
    return {"messages": state["messages"] + [{"role": "user", "content": str(results)}]}

def write_draft(state: AgentState) -> AgentState:
    n = state["current_draft"]
    total = state["task"].get("count", 1)
    sdk.set_progress(0.3 + (n / total) * 0.5, f"Writing item {n + 1} of {total}...")
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=state["messages"] + [{"role": "user", "content": f"Write item {n+1}"}]
    )
    draft = response.content[0].text
    sdk.log(f"Draft {n + 1} complete ({len(draft)} chars)")
    return {
        "drafts": state["drafts"] + [draft],
        "current_draft": n + 1,
        "messages": state["messages"]
    }

def should_continue(state: AgentState) -> str:
    """Conditional edge — loop back to write or move to finish."""
    total = state["task"].get("count", 1)
    return "write" if state["current_draft"] < total else "finish"

def finish(state: AgentState) -> AgentState:
    sdk.set_progress(0.95, "Formatting output...")
    combined = "\n\n---\n\n".join(state["drafts"])
    path = write_file("/workspace/output.md", combined)
    sdk.upload_file(path)
    sdk.complete({"content": combined, "count": len(state["drafts"])})
    return {"done": True}

# ── 3. Graph wiring ───────────────────────────────────────────────
def build_graph():
    g = StateGraph(AgentState)
    g.add_node("plan", plan)
    g.add_node("research", research)
    g.add_node("write", write_draft)
    g.add_node("finish", finish)
    g.set_entry_point("plan")
    g.add_edge("plan", "research")
    g.add_edge("research", "write")
    g.add_conditional_edges("write", should_continue, {"write": "write", "finish": "finish"})
    g.add_edge("finish", END)
    return g.compile()

# ── 4. Entrypoint ─────────────────────────────────────────────────
if __name__ == "__main__":
    task = sdk.task_input()
    sdk.log(f"Starting task: {task.get('deliverable', 'unknown')}")
    app = build_graph()
    app.invoke({
        "task": task,
        "messages": [],
        "drafts": [],
        "current_draft": 0,
        "done": False
    })
```

---

## Postgres Schema

```sql
-- agents: one row per marketplace listing
CREATE TABLE agents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    category    TEXT,                        -- content, research, code, data, email
    hourly_rate NUMERIC(10,2) NOT NULL,
    image_name  TEXT NOT NULL,               -- local Docker image name e.g. agent-content
    avg_hours   NUMERIC(5,2),               -- estimated delivery hours
    status      TEXT DEFAULT 'active',       -- active | suspended | pending_review
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- jobs: one row per customer task
CREATE TABLE jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     UUID REFERENCES agents(id),
    task_spec    JSONB NOT NULL,             -- full task spec from requirement gatherer
    status       TEXT DEFAULT 'queued',      -- queued | running | done | failed | accepted | paid
    progress_pct NUMERIC(5,2) DEFAULT 0,
    progress_msg TEXT,
    output_path  TEXT,                       -- local path to result file
    estimated_hours NUMERIC(5,2),
    actual_hours    NUMERIC(5,2),
    cost_estimate   NUMERIC(10,2),
    cost_final      NUMERIC(10,2),
    customer_email  TEXT,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    accepted_at  TIMESTAMPTZ,
    paid_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Task Spec JSON — The Universal Interface

The requirement gatherer produces this. It is passed to every agent as `TASK_SPEC` env var.

```json
{
  "job_id": "uuid",
  "task_type": "content",
  "deliverable": "5 blog posts for an HR SaaS targeting People Ops teams",
  "count": 5,
  "topic": "employee onboarding, remote culture, performance reviews",
  "tone": "professional but conversational",
  "audience": "HR managers at 50-500 person companies",
  "word_count_per_item": 800,
  "format": "markdown",
  "deadline_hours": 8,
  "constraints": ["no competitor mentions", "include a CTA at end of each post"],
  "customer_email": "user@example.com",
  "estimated_hours": 3.5,
  "estimated_cost": 42.00
}
```

---

## Dockerfile Template

Every agent uses this exact pattern. Never bake in API keys.

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install platform SDK from local path (Phase 1-3) or pip later
COPY ../../sdk/agentmarket_sdk ./agentmarket_sdk

COPY agent.py tools.py prompts.py ./

# Output and workspace dirs
RUN mkdir -p /outputs /workspace

# ANTHROPIC_API_KEY and TASK_SPEC injected at runtime — never baked in
CMD ["python", "agent.py"]
```

---

## docker-compose.yml (Phase 3 onwards)

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agentmarket
      POSTGRES_USER: agentmarket
      POSTGRES_PASSWORD: localdev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI — open this to see emails

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://agentmarket:localdev@postgres:5432/agentmarket
      REDIS_URL: redis://redis:6379/0
      SMTP_HOST: mailhog
      SMTP_PORT: 1025
      OUTPUTS_DIR: /outputs
    volumes:
      - ./outputs:/outputs
    depends_on:
      - postgres
      - redis

  celery-worker:
    build: ./backend
    command: celery -A worker worker --loglevel=info
    environment:
      DATABASE_URL: postgresql://agentmarket:localdev@postgres:5432/agentmarket
      REDIS_URL: redis://redis:6379/0
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OUTPUTS_DIR: /outputs
    volumes:
      - ./outputs:/outputs
      - /var/run/docker.sock:/var/run/docker.sock  # So Celery can run docker containers
    depends_on:
      - redis
      - postgres

  ui:
    build: ./ui
    ports:
      - "5173:5173"
    environment:
      VITE_API_BASE: http://localhost:8000
    depends_on:
      - backend

volumes:
  pgdata:
```

> **Note on `docker.sock` mount:** The Celery worker needs access to the host Docker socket so it can run `docker run agent-content ...` to spin up agent containers. This is the standard pattern for "Docker-in-Docker" on a local machine.

---

## Key Environment Variables

```bash
# .env.example

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Tavily (web search tool — free tier at tavily.com)
TAVILY_API_KEY=tvly-...

# Database (used by backend + celery worker)
DATABASE_URL=postgresql://agentmarket:localdev@localhost:5432/agentmarket

# Redis
REDIS_URL=redis://localhost:6379/0

# Email (points to Mailhog locally)
SMTP_HOST=localhost
SMTP_PORT=1025

# Paths
OUTPUTS_DIR=./outputs
```

---

## FastAPI Endpoints (Phase 3)

```
GET  /agents              → list all active agent listings
POST /agents              → register a new agent listing (seller)
GET  /agents/:id          → single agent detail

POST /jobs                → create a new job (triggers Celery task)
GET  /jobs/:id            → job status + progress
PATCH /jobs/:id/progress  → called by agent SDK (set_progress)
POST /jobs/:id/complete   → called by agent SDK (complete)
POST /jobs/:id/accept     → customer accepts output
POST /jobs/:id/pay        → mock payment (marks as paid, returns download URL)
GET  /jobs/:id/download   → serves the output file (requires paid status)

POST /gather              → runs requirement gatherer, returns task_spec + estimate
```

---

## Tools Available to Agents (Phase 1)

```python
# agents/content-writer/tools.py

import os
from tavily import TavilyClient

tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

def web_search(query: str, max_results: int = 5) -> list[dict]:
    """Search the web. Returns list of {title, url, content} dicts."""
    response = tavily.search(query=query, max_results=max_results)
    return response.get("results", [])

def write_file(path: str, content: str) -> str:
    """Write content to a file in /workspace/. Returns the path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path

def read_file(path: str) -> str:
    """Read a file from /workspace/."""
    with open(path) as f:
        return f.read()
```

---

## Sample task_spec.json (for Phase 1 local testing)

```json
{
  "job_id": "test-001",
  "task_type": "content",
  "deliverable": "3 short blog posts about AI productivity tools",
  "count": 3,
  "topic": "AI tools for productivity",
  "tone": "professional but friendly",
  "audience": "startup founders",
  "word_count_per_item": 400,
  "format": "markdown",
  "constraints": [],
  "customer_email": "demo@example.com",
  "estimated_hours": 1.5,
  "estimated_cost": 18.00
}
```

---

## What to Build First (Right Now)

Start with these three files in order:

1. `sdk/agentmarket_sdk/sdk.py` — the stub SDK (Phase 1 version, reads local JSON, writes to /outputs)
2. `agents/content-writer/tools.py` — `web_search` and `write_file` functions
3. `agents/content-writer/agent.py` — the LangGraph agent

Then run:
```bash
cd agents/content-writer
python agent.py
```

Expected result: a file appears at `outputs/test-001/result.md` containing 3 blog post drafts in markdown.

When that works, Phase 1 is complete. Come back to this document and move to Phase 2.

---

## Decisions Still Open (Do Not Build Yet)

- Real payment: Stripe (post-POC)
- Cloud hosting: AWS ECS + S3 (post-POC)
- Multi-tenancy: seller accounts, customer accounts with auth (post-POC)
- Agent review flow: Phase 7
- Concurrent tasks per agent: Phase 2 of the product (post-POC)
- LLM provider abstraction: LiteLLM only if multi-provider is needed (not now)

---

*Last updated: July 2026. Maintained alongside the build — update this file as decisions change.*
