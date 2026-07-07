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


class JobHireResponse(BaseModel):
    job_id: uuid.UUID
    status: str


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
