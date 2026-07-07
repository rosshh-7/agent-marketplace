// Shared TypeScript types mirroring the shapes in
// marketplace-platform/PLATFORM_CONTRACT.md §3 (Postgres entities) and §4
// (REST API). Where the contract doesn't spell out an exact field list for a
// response (e.g. "agent summary" vs "agent detail"), a reasonable shape is
// assumed and called out below — keep these in sync if the backend's actual
// response shapes differ once integrated.

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Seller {
  id: string;
  email: string;
  company_name: string | null;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SellerAuthResponse {
  token: string;
  seller: Seller;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentStatus = 'active' | 'pending_review' | 'flagged' | 'rejected' | 'suspended';

// Assumption: "agent summary" (GET /api/agents) is a trimmed-down projection
// of the `agents` table sufficient for a marketplace card; "agent detail"
// (GET /api/agents/:id) is the full row. Both are modeled here as the full
// shape since the contract doesn't distinguish field-by-field, and it's
// harmless for the summary payload to simply be a subset in practice.
export interface AgentSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  hourly_rate: number;
  avg_hours: number;
  card_copy: string | null;
  status: AgentStatus;
}

export interface AgentDetail extends AgentSummary {
  seller_id: string | null;
  image_name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export type JobStatus =
  | 'gathering'
  | 'queued'
  | 'running'
  | 'ready_for_review'
  | 'failed'
  | 'accepted'
  | 'rejected';

export const TERMINAL_JOB_STATUSES: JobStatus[] = [
  'ready_for_review',
  'accepted',
  'rejected',
  'failed',
];

// Assumption: job summary (GET /api/jobs, list view) omits the heavier
// jsonb blobs (`task_spec`, `requirements_raw`) that only matter on the
// detail page; job detail (GET /api/jobs/:id) includes everything.
export interface JobSummary {
  id: string;
  agent_id: string;
  status: JobStatus;
  progress_pct: number;
  progress_msg: string | null;
  initial_brief: string;
  customer_email: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
}

export interface JobDetail extends JobSummary {
  user_id: string;
  req_session_id: string | null;
  task_spec: Record<string, unknown> | null;
  requirements_raw: Record<string, unknown> | null;
  output_zip_path: string | null;
  preview_path: string | null;
  rejection_reason: string | null;
  // Convenience field some backends include so the detail page doesn't need
  // a second round trip to render the agent name; harmless if absent.
  agent?: AgentSummary;
}

export interface JobStartResponse {
  job_id: string;
  message: string;
  phase: 'gathering' | 'extracting' | 'done';
}

export interface JobChatResponse {
  message: string;
  phase: 'gathering' | 'extracting' | 'done';
}

export interface JobHireResponse {
  job_id: string;
  status: JobStatus;
}

export interface ChatMessage {
  id: string;
  job_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Seller submissions
// ---------------------------------------------------------------------------

export type SubmissionStatus = 'pending' | 'approved' | 'flagged' | 'rejected';

// Shape of review-agent's ReviewOut payload (§5), stored verbatim in
// seller_submissions.review_result. Fields beyond the documented ones are
// preserved via the index signature since review-agent may add more.
export interface ReviewResult {
  id: string;
  verdict: 'APPROVE' | 'FLAG' | 'REJECT';
  reasoning: string[];
  findings: unknown[];
  test_results: unknown[];
  quality_avg: number | null;
  pricing: Record<string, unknown> | null;
  card_copy: string | null;
  image_tag: string | null;
  [key: string]: unknown;
}

export interface SellerSubmissionSummary {
  id: string;
  agent_id: string | null;
  name: string;
  description: string;
  category: string;
  hourly_rate: number;
  avg_hours: number;
  status: SubmissionStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface SellerSubmissionDetail extends SellerSubmissionSummary {
  seller_id: string;
  tarball_path: string;
  review_result: ReviewResult | null;
}

export interface SellerUploadResponse {
  submission_id: string;
  status: SubmissionStatus;
}

// ---------------------------------------------------------------------------
// Generic error shape (FastAPI's default HTTPException body)
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  detail?: string | { msg: string }[] | Record<string, unknown>;
}
