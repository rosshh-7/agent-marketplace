"""Public agent browse routes: GET /api/agents, GET /api/agents/{agent_id}."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import Agent
from app.schemas import AgentDetail, AgentSummary

router = APIRouter(prefix="/agents", tags=["agents"])

# Slugs that should always be pinned to the top of the listing, in order.
_PINNED = ["html-ui-builder"]


@router.get("", response_model=list[AgentSummary])
def list_agents(
    category: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
) -> list[AgentSummary]:
    query = db.query(Agent).filter(Agent.status == "active")
    if category:
        query = query.filter(Agent.category == category)
    if q:
        like = f"%{q}%"
        query = query.filter(Agent.name.ilike(like) | Agent.description.ilike(like))
    # Pinned agents first (by position in _PINNED list), then alphabetically.
    pin_order = case(
        {slug: idx for idx, slug in enumerate(_PINNED)},
        value=Agent.slug,
        else_=len(_PINNED),
    )
    agents = query.order_by(pin_order, Agent.name).all()
    return [AgentSummary.model_validate(a) for a in agents]


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(agent_id: uuid.UUID, db: Session = Depends(get_db)) -> AgentDetail:
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return AgentDetail.model_validate(agent)
