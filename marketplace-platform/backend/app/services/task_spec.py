"""
Maps req-agent's generic `requirements` doc shape (see req-agent/api/server.py::_to_markdown
for the full field list) onto the flatter `task_spec` shape worker agents expect (see
listing-agent/html-ui-builder/agent.py::brief_context / resolve_page_list).

Kept in its own function/module per PLATFORM_CONTRACT.md §7 ("keep it in one function so
it's easy to improve later without touching orchestration logic") — this is a reasonable
default mapping, not a hard spec.
"""
import uuid


def build_task_spec(job_id: uuid.UUID, category: str | None, customer_email: str, requirements: dict) -> dict:
    goals = requirements.get("goals") or []
    stakeholders = requirements.get("stakeholders") or []
    functional_requirements = requirements.get("functional_requirements") or []
    constraints = requirements.get("constraints") or []

    return {
        "job_id": str(job_id),
        "task_type": category or "content",
        "deliverable": (
            requirements.get("project_overview")
            or requirements.get("project_name")
            or "A simple, elegant deliverable."
        ),
        "topic": "; ".join(goals),
        "tone": "clean and professional",  # no strong signal from req-agent today
        "audience": next(iter(stakeholders), "general visitors"),
        "constraints": constraints,
        "count": len(functional_requirements) or 1,
        "customer_email": customer_email,
    }
