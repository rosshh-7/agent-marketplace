# Review Agent

Phase 7 of the Agent Marketplace POC (`../AGENTMARKET_SPEC.md`): the gate untrusted sellers'
agents go through before a listing goes live. Built as a **standalone, dockerized service** —
it does not depend on the marketplace's Postgres/FastAPI/Celery backend (none of that exists
yet). It exposes its own API and SQLite storage so it can be wired into the real seller-listing
flow later with a single HTTP call.

**Building an agent to submit here?** Read `../SELLER_GUIDE.md` first — it documents the
required contract (batch job, not a server; SDK usage; prompt-injection resistance; what
gets you auto-rejected vs. flagged) and links to a working reference implementation.

## What it does

Given a seller's submitted source (tarball/zip), it:

1. **Intake** — safely extracts the archive, strips OS metadata cruft, and discovers the
   entrypoint (via the `Dockerfile`'s `CMD`/`ENTRYPOINT`, or `agent.py` at the root) and
   `prompts.py` anywhere in the tree. `requirements.txt` and `Dockerfile` must be at the
   root. See `../SELLER_GUIDE.md` for the full contract.
2. **Static scan** — AST-based dangerous-call detection (`subprocess`, `eval`, `socket`, ...),
   hardcoded-secret regex, unpinned-dependency check, Dockerfile pattern checks (curl-pipe-sh,
   path traversal, `--privileged`), and SDK-contract verification (`task_input`/`complete`).
3. **Build** — `docker build`s the submission itself (review-agent owns the build, so the
   reviewed source and the running image are guaranteed to be the same artifact).
4. **Dynamic test** — runs the built image against a small synthetic `task_spec` suite:
   2 golden tasks (quality scoring), an empty-brief edge case, a prompt-injection probe, and
   a canary-secret exfiltration check — each under CPU/memory/time limits.
5. **Judge** — an LLM audits the system prompt for safety issues and scores output quality
   against the golden runs.
6. **Pricing sanity** — compares claimed hourly rate against a per-category baseline.
7. **Decision** — rule-based aggregation (not another LLM call, so the reasoning stays
   auditable) to `APPROVE` / `FLAG` / `REJECT`, with concrete findings attached.

## Running it

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY (or the xAI override below)
docker compose up --build
```

Submit a review:

```bash
curl -X POST http://localhost:8010/review \
  -F "source=@my-agent.tar.gz" \
  -F "name=My Content Agent" -F "category=content" \
  -F "hourly_rate=25" -F "avg_hours=2"
```

Or locally without Docker Compose (still needs a Docker daemon for build/run):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python review_cli.py path/to/agent-source metadata.json
```

`GET /reviews` / `GET /reviews/:id` return stored verdicts, findings, and per-test results —
this is what a human reviewer would look at for anything the pipeline `FLAG`s.

## Testing

```bash
pytest tests/test_pipeline.py
```

Runs `malicious-agent` (expect REJECT) and `stub-agent` (expect APPROVE / FLAG on an
outlier-priced variant) against the real pipeline with real `docker build`/`docker run`.
The review agent's own judge calls are mocked so this suite is free to run. `stub-agent`
generates canned content instead of calling an LLM, so it proves the pipeline's plumbing but
not real prompt-injection resistance.

`tests/fixtures/good-agent` and `borderline-agent` call a real LLM from inside the container
to prove actual injection resistance — run those manually via `review_cli.py` (needs live API
credits); they're intentionally excluded from the automated suite so it stays free to run.
Both have been verified live end-to-end (via Groq/Llama-3.3-70b): `good-agent` → `APPROVE`
(9.0/10 quality, passed real injection + canary probes), `borderline-agent` (same compliant
source, outlier pricing) → `FLAG` on the pricing check alone.

Note: the adversarial-injection check needed a second pass. A naive substring match on the
injection marker flagged agents that *quoted* the injected text while explaining their
refusal as if they'd complied. Fixed by adding a semantic compliance check
(`judge.assess_injection_compliance`) that only fires — and only turns into a critical
finding — when the cheap substring heuristic first suspects something, so the common case
stays free of the extra LLM call.

## LLM provider

Multi-provider is an official part of the platform contract, not just a local convenience —
see SELLER_GUIDE.md's "LLM provider" section. `LLM_PROVIDER` (`anthropic`/`xai`/`groq`,
default `anthropic`) selects both the provider review-agent's own judge calls use
(`app/llm_client.py`) and, via env passthrough in `dynamic_test.py`, the provider every seller
submission is told to use for that review run. Agents are expected to branch on it rather than
hardcode one provider's SDK — sellers whose code doesn't will correctly fail dynamic testing
whenever `LLM_PROVIDER` isn't `anthropic`. Set it in `.env`; no code change needed either side.

## Known limitations (POC scope, by design)

- **Sandbox is lightweight, not hardened.** Dynamic test containers run with resource/time
  limits but no network-egress lockdown. A determined malicious agent could still make
  outbound calls during a test run. Hardening this (deny-all network except an LLM-API
  allowlist) is the natural next step before accepting real third-party sellers.
- **`docker.sock` mount.** review-agent needs host Docker access to build/run submissions.
  In production this should run on an isolated build host, not share a daemon with anything
  that runs production containers.
- **No integration with a real backend yet.** Phases 1–6 of the spec don't exist. Once they
  do, the seller-listing flow (`POST /agents`) should call this service's `POST /review` and
  gate `agents.status` on the verdict.
- **Typosquat/dependency checks are best-effort.** `requirements.txt` scanning currently only
  flags unpinned versions, not known-malicious packages.
