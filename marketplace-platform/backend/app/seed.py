"""
Startup seed: makes sure the one worker agent that exists today (HTML UI Builder,
listing-agent/html-ui-builder/) is listed and active so the marketplace isn't empty out of
the box (contract §3).

Values below are taken directly from listing-agent/html-ui-builder/metadata.json — hardcoded
rather than read from that file at runtime because the backend's Docker build context/image
doesn't (and per the contract shouldn't) include sibling top-level directories from the
monorepo. `image_name` is the tag the Docker Agent's build pass is expected to produce; this
seed only *references* it; the backend never builds worker images itself.
"""
import logging

from sqlalchemy.orm import Session

from app.logging_setup import log_kv
from app.models import Agent

logger = logging.getLogger("seed")

HTML_UI_BUILDER_SLUG = "html-ui-builder"

HTML_UI_BUILDER_SEED = {
    "name": "HTML UI Builder",
    "slug": HTML_UI_BUILDER_SLUG,
    "description": (
        "Builds small static websites — single-page landing pages and simple multi-page "
        "brochure sites — as clean, responsive, self-contained HTML/CSS/JS."
    ),
    "category": "code",
    "hourly_rate": 30.0,
    "avg_hours": 2.0,
    "image_name": "agent-html-ui-builder",
    "status": "active",
}


def seed_agents(db: Session) -> None:
    existing = db.query(Agent).filter(Agent.slug == HTML_UI_BUILDER_SLUG).first()
    if existing is not None:
        return

    agent = Agent(seller_id=None, **HTML_UI_BUILDER_SEED)
    db.add(agent)
    db.commit()
    log_kv(logger, logging.INFO, "seeded platform-owned agent listing", slug=HTML_UI_BUILDER_SLUG)
