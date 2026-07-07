# Agent Marketplace — Frontend

React + TypeScript app (built with Webpack, not Vite/CRA) implementing both the customer
and seller journeys described in `../PLATFORM_CONTRACT.md` §9.

## Running locally

Requirements: Node 18+ (tested with Node 22).

```bash
cd marketplace-platform/frontend
npm install
npm start
```

This starts `webpack serve` on **http://localhost:3000**. The dev server proxies any
request to `/api/*` to the backend at **http://localhost:8000** (see `webpack.config.js`),
so the backend must be running there for anything beyond the static "browse agents" page
to work end-to-end. Until the backend is up, the app itself still compiles and renders
(you'll just see fetch errors surfaced as inline error banners instead of data).

### Production build

```bash
npm run build
```

Outputs a static bundle to `dist/`. In production the app expects to be served from the
same origin as the backend's `/api/*` routes (e.g. behind a shared reverse proxy) — see
`API_BASE_URL` below if that's not the case.

### Type-checking only

```bash
npm run typecheck
```

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `API_BASE_URL` | build-time env (webpack `DefinePlugin`) | `""` (same origin) | Prefixed onto every API call. Leave empty when the dev-server proxy (dev) or a reverse proxy (prod) puts the frontend and backend on the same origin. Set to an absolute URL (e.g. `https://api.example.com`) to call a backend on a different origin. |

Example: `API_BASE_URL=https://api.example.com npm run build`

The backend URL used by the **dev-server proxy** (not the same thing as `API_BASE_URL`,
which affects the built bundle) is hardcoded to `http://localhost:8000` in
`webpack.config.js`, matching `PLATFORM_CONTRACT.md`'s default. Edit the `devServer.proxy`
target there if your local backend runs elsewhere.

## Docker

```bash
docker build -t agentmarket-frontend .
docker run -p 8080:80 agentmarket-frontend
```

Builds a static bundle and serves it via nginx (see `Dockerfile` / `nginx.conf`). The
top-level `docker-compose.yml` (built separately) is expected to front this container with
whatever routing gets `/api/*` to the backend service.

## Project structure

```
src/
  api/            One client module per backend resource (auth, agents, jobs,
                   sellerAuth, seller) — thin wrappers around fetch via api/client.ts.
  components/     Reusable UI: Navbar, AgentCard, StatusChip, ProgressBar, ChatWindow,
                   ErrorBanner, RequireCustomerAuth/RequireSellerAuth route guards.
  context/        CustomerAuthContext and SellerAuthContext — two entirely separate
                   token stores/contexts, since customer and seller JWTs are distinct
                   auth realms per the contract (§4) and must never cross over.
  hooks/          usePoll — generic polling hook used for job status and seller
                   submission status while non-terminal.
  pages/          One component per route in PLATFORM_CONTRACT.md §9.
  styles/         Global plain CSS (no design system dependency).
  types.ts        TypeScript types mirroring the contract's Postgres entities (§3)
                  and REST response shapes (§4).
  App.tsx         Route table.
  index.tsx       Entry point.
```

## Routes implemented (PLATFORM_CONTRACT.md §9)

- `/` — Browse agents (grid, search + category filter)
- `/agents/:agentId` — Agent detail + "describe your task" + Hire
- `/login`, `/signup` — Customer auth
- `/dashboard` — My jobs, with status chips
- `/dashboard/jobs/:jobId` — Unified job view: chat UI while `gathering`, progress bar
  while `queued`/`running`, iframe preview + Accept/Reject/Download once
  `ready_for_review`/`accepted`/`rejected`
- `/seller/login`, `/seller/signup` — Seller auth
- `/seller/dashboard` — My submissions, with status chips
- `/seller/agents/new` — Upload form (metadata + `.tar.gz`)
- `/seller/agents/:submissionId` — Submission detail: status + review findings

## Assumptions / notes for backend integration

These are called out inline as code comments too (search for "Assumption" in `src/`):

- **Agent summary vs. detail**: the contract doesn't spell out whether `GET /api/agents`
  returns a trimmed projection vs. the full row. `AgentSummary`/`AgentDetail` in
  `src/types.ts` are modeled as (effectively) the same shape — harmless either way since
  extra fields are simply ignored.
- **Job summary vs. detail**: same assumption — `JobSummary` (list view) omits the heavy
  `task_spec`/`requirements_raw` JSON blobs that `JobDetail` includes, since those only
  matter on the single-job page.
- **Download route auth**: `GET /api/jobs/{job_id}/download` is invoked as a plain
  `<a href>` / programmatic anchor click (so the browser handles the file save and
  `Content-Disposition` header), which means no `Authorization` bearer header can be
  attached. The frontend assumes this route either doesn't require auth or accepts some
  other mechanism (cookie, signed URL) — flagged here since §4 doesn't specify.
- **Accept triggers download**: per contract §2 ("clicking Accept should trigger an
  automatic browser download"), `JobDetailPage` fires a synthetic anchor click at the
  download URL immediately after a successful `POST /api/jobs/:id/accept`.
- **Chat message ids while gathering**: the initial exchange from `POST /api/jobs/start`
  is loaded via `GET /api/jobs/:id/messages` (the audit trail) when the job-detail page
  mounts; messages sent afterward via `POST /api/jobs/:id/chat` are appended to local
  state with a client-generated id, since that endpoint's response is `{message, phase}`
  with no message id.
- **Polling semantics**: `usePoll` (see `src/hooks/usePoll.ts`) treats `gathering` and
  all terminal statuses (`ready_for_review`/`accepted`/`rejected`/`failed`) alike — fetch
  once and stop — and only repeats the fetch while `queued`/`running`, matching §9's
  wording exactly.
- **CORS/same-origin in dev**: the iframe preview (`/api/jobs/:id/preview/index.html`) is
  rendered same-origin via the dev-server proxy per §8, so relative links/assets inside
  the generated static site resolve correctly without extra CORS configuration.
