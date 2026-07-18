"""
Startup seed — ensures a set of platform-owned demo agents are listed and active
so the marketplace has a diverse catalog out of the box (contract §3).
"""
import logging

from sqlalchemy.orm import Session

from app.logging_setup import log_kv
from app.models import Agent

logger = logging.getLogger("seed")

SEED_AGENTS = [
    {
        "name": "HTML UI Builder",
        "slug": "html-ui-builder",
        "description": (
            "Builds small static websites — single-page landing pages and simple multi-page "
            "brochure sites — as clean, responsive, self-contained HTML/CSS/JS."
        ),
        "category": "code",
        "hourly_rate": 30.0,
        "avg_hours": 2.0,
        "image_name": "agent-html-ui-builder",
        "status": "active",
        "card_copy": "Drop your brief, get a polished static site in hours.",
        "tags": ["html", "css", "javascript", "landing-page", "static-site"],
    },
    {
        "name": "Data Analyst",
        "slug": "data-analyst",
        "description": (
            "Performs exploratory data analysis on CSV or Excel files: summaries, "
            "correlations, visualisations, and plain-English insights."
        ),
        "category": "data",
        "hourly_rate": 45.0,
        "avg_hours": 3.0,
        "image_name": "agent-data-analyst",
        "status": "active",
        "card_copy": "Upload your data, get charts, stats, and key insights automatically.",
        "tags": ["eda", "csv", "excel", "pandas", "visualisation", "insights"],
    },
    {
        "name": "API Builder",
        "slug": "api-builder",
        "description": (
            "Designs and scaffolds REST APIs — OpenAPI spec, route handlers, "
            "auth middleware, and basic tests — ready to deploy."
        ),
        "category": "code",
        "hourly_rate": 50.0,
        "avg_hours": 4.0,
        "image_name": "agent-api-builder",
        "status": "active",
        "card_copy": "Describe your API and get production-ready code with docs.",
        "tags": ["rest", "openapi", "fastapi", "nodejs", "auth", "backend"],
    },
    {
        "name": "Content Writer",
        "slug": "content-writer",
        "description": (
            "Writes blog posts, product descriptions, email sequences, and marketing copy "
            "tailored to your brand voice and target audience."
        ),
        "category": "content",
        "hourly_rate": 20.0,
        "avg_hours": 1.5,
        "image_name": "agent-content-writer",
        "status": "active",
        "card_copy": "Brand-aligned copy delivered fast — blog, email, or product pages.",
        "tags": ["blog", "copywriting", "email", "seo", "marketing"],
    },
    {
        "name": "SQL Report Generator",
        "slug": "sql-report-generator",
        "description": (
            "Translates natural-language questions into SQL queries, runs them against "
            "your schema, and returns formatted reports with commentary."
        ),
        "category": "data",
        "hourly_rate": 35.0,
        "avg_hours": 1.0,
        "image_name": "agent-sql-report",
        "status": "active",
        "card_copy": "Ask business questions in plain English, get SQL reports back.",
        "tags": ["sql", "postgresql", "reporting", "bi", "analytics"],
    },
    {
        "name": "Research Summariser",
        "slug": "research-summariser",
        "description": (
            "Scours the web, reads papers and articles, and delivers a structured "
            "summary with key findings, source links, and a verdict."
        ),
        "category": "research",
        "hourly_rate": 25.0,
        "avg_hours": 2.0,
        "image_name": "agent-research-summariser",
        "status": "active",
        "card_copy": "Give a topic, get a sharp research brief with cited sources.",
        "tags": ["research", "summarisation", "web-search", "literature-review"],
    },
    {
        "name": "Email Automation",
        "slug": "email-automation",
        "description": (
            "Builds drip campaigns, onboarding sequences, and transactional email flows "
            "— copy, HTML templates, and integration code for your ESP."
        ),
        "category": "content",
        "hourly_rate": 40.0,
        "avg_hours": 3.0,
        "image_name": "agent-email-automation",
        "status": "active",
        "card_copy": "Full email sequences — copy + HTML templates + ESP setup code.",
        "tags": ["email", "drip-campaign", "sendgrid", "mailchimp", "onboarding"],
    },
    {
        "name": "Dashboard Builder",
        "slug": "dashboard-builder",
        "description": (
            "Creates interactive data dashboards from your data sources — charts, "
            "KPI cards, filters, and exports — as a standalone web app."
        ),
        "category": "data",
        "hourly_rate": 55.0,
        "avg_hours": 5.0,
        "image_name": "agent-dashboard-builder",
        "status": "active",
        "card_copy": "Connect your data, get a live dashboard you can share instantly.",
        "tags": ["dashboard", "charts", "react", "d3", "kpi", "analytics"],
    },
    {
        "name": "Code Reviewer",
        "slug": "code-reviewer",
        "description": (
            "Reviews pull requests and codebases for bugs, security issues, "
            "performance problems, and style — with actionable inline comments."
        ),
        "category": "code",
        "hourly_rate": 40.0,
        "avg_hours": 2.0,
        "image_name": "agent-code-reviewer",
        "status": "active",
        "card_copy": "Paste your code, get senior-engineer-level review in minutes.",
        "tags": ["code-review", "security", "performance", "python", "typescript"],
    },
    {
        "name": "Market Research Agent",
        "slug": "market-research",
        "description": (
            "Researches competitors, analyses market trends, and produces a "
            "structured report with TAM estimates, positioning gaps, and opportunities."
        ),
        "category": "research",
        "hourly_rate": 60.0,
        "avg_hours": 4.0,
        "image_name": "agent-market-research",
        "status": "active",
        "card_copy": "Competitive landscape, TAM, and positioning gaps — all in one report.",
        "tags": ["market-research", "competitor-analysis", "tam", "strategy"],
    },
]


def seed_agents(db: Session) -> None:
    for data in SEED_AGENTS:
        slug = data["slug"]
        existing = db.query(Agent).filter(Agent.slug == slug).first()
        if existing is not None:
            # Update tags on existing agents if not already set
            if not existing.tags:
                existing.tags = data.get("tags", [])
                db.commit()
            continue
        agent = Agent(seller_id=None, **data)
        db.add(agent)
        log_kv(logger, logging.INFO, "seeded platform-owned agent listing", slug=slug)
    db.commit()
