"""
Pydantic request/response models — one section per resource, matching the shapes in
PLATFORM_CONTRACT.md §4. Kept flat in one module (rather than split per-router) since the
schemas are small and this makes it easy to see the full request/response surface at once.
"""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- Auth (customer) ----------


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    token: str
    user: UserOut


# ---------- Auth (seller) ----------


class SellerSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    company_name: str | None = None


class SellerLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SellerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    company_name: str | None
    created_at: datetime


class SellerTokenResponse(BaseModel):
    token: str
    seller: SellerOut


# ---------- Agents ----------


class AgentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    category: str | None
    hourly_rate: float | None
    avg_hours: float | None
    status: str
    card_copy: str | None
    tags: list[str] = []
    rating_avg: float | None = None
    rating_count: int = 0


class AgentDetail(AgentSummary):
    seller_id: uuid.UUID | None
    image_name: str
    created_at: datetime


# ---------- Jobs — hire flow ----------


class JobStartRequest(BaseModel):
    agent_id: uuid.UUID
    brief: str = Field(min_length=1)


class JobStartResponse(BaseModel):
    job_id: uuid.UUID
    message: str
    phase: str


class JobChatRequest(BaseModel):
    message: str = Field(min_length=1)


class JobChatResponse(BaseModel):
    message: str
    phase: str
    completeness_score: int = 0


class JobFinalizeResponse(BaseModel):
    requirements: dict[str, Any]
    completeness_score: int
    vague_areas: list[str]
    confirm_message: str


class JobHireResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    worker_launched: bool = False
    review_status: str = ""
    review_feedback: str = ""
    review_gaps: list[str] = []
    review_strengths: list[str] = []
    review_recommendations: list[str] = []
    feasibility_score: int = 0


class JobRequirementsDownload(BaseModel):
    content: str
    filename: str
    media_type: str


class JobSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID
    status: str
    progress_pct: float
    progress_msg: str | None
    created_at: datetime
    completed_at: datetime | None


class JobDetail(JobSummary):
    user_id: uuid.UUID
    req_session_id: str | None
    initial_brief: str | None
    task_spec: dict[str, Any] | None
    requirements_raw: dict[str, Any] | None
    output_zip_path: str | None
    preview_path: str | None
    customer_email: str
    rejection_reason: str | None
    started_at: datetime | None
    accepted_at: datetime | None
    rejected_at: datetime | None


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class RejectRequest(BaseModel):
    reason: str | None = None


class ReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: str | None = None


class ReviewResponse(BaseModel):
    message: str
    new_rating_avg: float
    new_rating_count: int


# ---------- SDK callbacks (unprefixed, §6) ----------


class ProgressCallback(BaseModel):
    pct: float = Field(ge=0.0, le=1.0)
    message: str = ""


class CompleteCallback(BaseModel):
    output_path: str


# ---------- Seller submissions ----------


class SubmissionUploadResponse(BaseModel):
    submission_id: uuid.UUID
    status: str


class SubmissionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    category: str
    hourly_rate: float
    avg_hours: float
    status: str
    agent_id: uuid.UUID | None
    created_at: datetime
    reviewed_at: datetime | None


class SubmissionDetail(SubmissionSummary):
    description: str | None
    review_result: dict[str, Any] | None


# ---------- Seller dashboard ----------


class SellerAgentStats(BaseModel):
    """Per-listed-agent usage + earnings rollup for the seller dashboard."""

    agent_id: uuid.UUID
    name: str
    category: str | None
    status: str
    hourly_rate: float | None
    avg_hours: float | None
    jobs_total: int
    jobs_active: int
    jobs_awaiting_review: int
    jobs_accepted: int
    jobs_rejected: int
    earnings: float
    last_job_at: datetime | None


class SellerNotification(BaseModel):
    """Derived from submission/job events at read time — there is no
    notifications table; see routers/seller_agents.py::seller_dashboard."""

    id: str
    kind: str  # submission_approved | submission_flagged | submission_rejected
    #          | job_hired | job_accepted | job_rejected
    title: str
    body: str | None
    at: datetime


class SellerDashboard(BaseModel):
    total_earnings: float
    pending_earnings: float
    total_jobs: int
    active_agents: int
    agents: list[SellerAgentStats]
    notifications: list[SellerNotification]
