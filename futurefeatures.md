# Future Features — Agent Marketplace

Twelve candidate features to make the marketplace stand out, roughly ordered by how much
they'd differentiate the platform. Each one builds on infrastructure that already exists:
the per-job Docker launcher (`marketplace-platform/backend/app/services/docker_launcher.py`),
the SDK progress callbacks (`agentmarket_sdk/sdk.py`), the requirement-gatherer chat
(`req-agent`), and the review-agent listing gate (`review-agent`).

---

## Headline differentiators

### 1. Bake-off hiring (agent competitions)

The killer feature only an *agent* marketplace can offer — human freelance marketplaces
can't do it because human time is expensive, but containers are cheap.

- The customer's brief fans out to 3 matched agents in parallel.
- Each produces a small sample slice (first section, one mockup).
- The customer picks the winner, who then completes the full job.

**Builds on:** `docker_launcher.py` already spawns one container per job; spawn N instead.
The review-agent can pre-rank the samples before the customer sees them.

### 2. The marketplace as an MCP server — agents hiring agents

Expose browse / brief / hire / accept as MCP tools so that Claude Code, other assistants,
or even *listed agents mid-job* can hire from the marketplace programmatically.

This turns the project from "Upwork for agents" into infrastructure for an agent-to-agent
economy — a much bigger story for a demo or pitch.

**Builds on:** the FastAPI backend already has the REST surface; an MCP wrapper over it is
a thin layer.

### 3. Steerable jobs (mid-run collaboration)

Make the SDK callback channel bidirectional:

- The agent can pause and ask the customer a clarifying question (billing clock pauses).
- The customer can watch a live "workroom" — the agent's plan, tool calls, intermediate
  drafts — and interject a correction before the job finishes wrong.

This kills the #1 failure mode of fire-and-forget agents: discovering at review time that
the brief was misread.

**Builds on:** the SDK already posts progress callbacks to the backend.

### 4. Proof-of-work reputation instead of star ratings

Because the platform owns execution, ratings can be backed by hard telemetry no other
marketplace has:

- Actual runtime vs. estimate
- Retry counts
- Tool-call logs
- Judge scores
- Acceptance rate

Show an evidence-backed scorecard on each agent card. Star reviews are gameable; execution
telemetry isn't.

---

## Trust and quality (extends the review-agent)

### 5. Per-deliverable AI escrow judge

The review-agent already judges sellers at listing time. Also judge every *deliverable*
against its `task_spec` before the completion email goes out, with one automatic
revise-and-retry loop on failure.

"Everything arrives pre-QA'd" is a strong marketplace promise, and the existing
accept/pay gate becomes the second line of defense rather than the only one.

### 6. Category benchmark leaderboards

Run every listed agent against a standardized eval suite for its category (reusing the
review-agent's sandboxed test-container machinery) and publish comparable scores. Buyers
compare agents on evidence instead of marketing copy.

### 7. Signed provenance reports

Ship each deliverable with a hash-chained audit log of every LLM call and tool call that
produced it. For enterprise buyers who need AI-content disclosure or auditability, this is
a real differentiator — and nearly free to produce, since everything already flows through
the SDK.

---

## Pricing and business-model twists

### 8. Reverse auctions

Instead of the customer picking an agent, the brief gets posted and matched agents "bid" —
price, ETA, and a tiny generated sample. Combines naturally with bake-off hiring (#1).

### 9. Outcome-based pricing

The estimator already maps task specs to hours; take the next step and quote a fixed price
per accepted deliverable, with automatic refund if the escrow judge (#5) fails it twice.
"Pay for results, not hours" reads much better than hourly billing for autonomous agents.

### 10. Retainers / scheduled agents

Let customers hire an agent on a cron schedule ("competitor digest every Monday morning").
Recurring revenue for sellers, and the job-launch machinery is identical — it just needs a
scheduler row and a loop.

---

## Ecosystem plays

### 11. Agent forking with royalty splits

Let a seller fork an existing listed agent, improve its prompts/tools, and relist it with
an automatic revenue share to the original author. This creates a GitHub-style improvement
flywheel on top of the seller-kit, instead of every seller starting from zero.

### 12. Agent pipelines

Let the requirement-gatherer assemble *teams* — researcher → writer → editor — where each
stage is a separate listed agent and the platform pipes one job's `/outputs` into the next
job's input. The marketplace of agents becomes a marketplace of workflows, and sellers earn
from being a good *stage*, not just a good soloist.

---

## Suggested short list

For maximum demo impact relative to effort:

- **#3 Steerable jobs** and **#5 Deliverable judge** — small lifts on existing
  infrastructure.
- **#1 Bake-offs** or **#2 MCP hiring** — the headline feature nobody else has.
