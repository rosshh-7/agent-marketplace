import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import Column, String, Float, DateTime, JSON

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=_uuid)
    seller_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    hourly_rate = Column(Float, nullable=False)
    avg_hours = Column(Float, nullable=False)

    verdict = Column(String, nullable=False)
    reasoning = Column(JSON, nullable=False)       # list[str]
    findings = Column(JSON, nullable=False)         # list[Finding]
    test_results = Column(JSON, nullable=False)     # list[TestCaseResult]
    quality_avg = Column(Float, nullable=True)
    pricing = Column(JSON, nullable=True)
    card_copy = Column(String, nullable=True)
    image_tag = Column(String, nullable=True)

    created_at = Column(DateTime, default=_now)


class SellerMetadataIn(BaseModel):
    name: str
    description: str = ""
    category: str
    hourly_rate: float
    avg_hours: float


class ReviewOut(BaseModel):
    id: str
    seller_name: str
    category: str
    hourly_rate: float
    avg_hours: float
    verdict: str
    reasoning: list[str]
    findings: list[dict]
    test_results: list[dict]
    quality_avg: float | None
    pricing: dict | None
    card_copy: str | None
    image_tag: str | None
    created_at: datetime

    class Config:
        from_attributes = True
