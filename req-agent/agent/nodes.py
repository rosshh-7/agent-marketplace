import json
import re
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from .state import RequirementsState
from .prompts import (
    CONVERSATION_SYSTEM, FORM_SYSTEM, TOPIC_EXTRAS,
    EXTRACT_PROMPT, PM_REVIEW_PROMPT, CONFIRM_ADDENDUM,
)

load_dotenv()

_PROVIDER = os.getenv("LLM_PROVIDER", "xai")

_PROVIDER_CONFIG = {
    "xai": dict(
        model=os.getenv("XAI_MODEL", "grok-4"),
        openai_api_key=os.getenv("XAI_API_KEY"),
        openai_api_base="https://api.x.ai/v1",
    ),
    "groq": dict(
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        openai_api_key=os.getenv("GROQ_API_KEY"),
        openai_api_base="https://api.groq.com/openai/v1",
    ),
    "anthropic": dict(
        model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        openai_api_key=os.getenv("ANTHROPIC_API_KEY"),
        openai_api_base="https://api.anthropic.com/v1",
    ),
}

_cfg = _PROVIDER_CONFIG.get(_PROVIDER, _PROVIDER_CONFIG["xai"])
_llm = ChatOpenAI(temperature=0.7, **_cfg)
_pm_llm = ChatOpenAI(temperature=0.3, **_cfg)


def _build_system_prompt(state: RequirementsState) -> str:
    mode = state.get("mode", "conversation")
    topic = state.get("topic", "general")
    extra = TOPIC_EXTRAS.get(topic, "")
    template = FORM_SYSTEM if mode == "form" else CONVERSATION_SYSTEM
    base = template.format(extra=extra)
    if state.get("phase") == "confirming":
        base += CONFIRM_ADDENDUM
    return base


def _parse_json(content: str) -> dict:
    content = content.strip()

    def _try(s: str) -> dict | None:
        try:
            result = json.loads(s)
            return result if isinstance(result, dict) else None
        except json.JSONDecodeError:
            return None

    if (r := _try(content)):
        return r

    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.DOTALL).strip()
    if (r := _try(stripped)):
        return r

    match = re.search(r"\{.*\}", stripped, re.DOTALL)
    if match:
        candidate = match.group()
        safe = re.sub(r'(?<!\\)[\x00-\x1f\x7f]', lambda m: repr(m.group())[1:-1], candidate)
        if (r := _try(safe)):
            return r

    return {}


def _compute_completeness(req: dict) -> tuple[int, list[str]]:
    checks = [
        ("project_name",                10, "Project name"),
        ("project_overview",            15, "Project overview"),
        ("goals",                       15, "Goals and success metrics"),
        ("functional_requirements",     20, "Functional requirements"),
        ("non_functional_requirements", 10, "Non-functional requirements"),
        ("stakeholders",                10, "Users and stakeholders"),
        ("constraints",                 10, "Constraints (budget, timeline, tech)"),
        ("out_of_scope",                10, "Out-of-scope items"),
    ]
    score = 0
    missing: list[str] = []
    for field, weight, label in checks:
        val = req.get(field)
        filled = bool(val) and (len(val) > 0 if isinstance(val, (list, str)) else True)
        if filled:
            score += weight
        else:
            missing.append(label)
    return min(score, 100), missing


def _build_confirm_message(req: dict) -> str:
    bullets: list[str] = []
    if name := req.get("project_name"):
        bullets.append(f"**Project:** {name}")
    if overview := req.get("project_overview"):
        bullets.append(f"**Overview:** {overview[:120]}{'…' if len(overview) > 120 else ''}")
    goals = req.get("goals") or []
    if goals:
        bullets.append(f"**Goals:** {', '.join(goals[:3])}")
    frs = req.get("functional_requirements") or []
    if frs:
        titles = ", ".join(fr.get("title", "") for fr in frs[:3])
        bullets.append(f"**Features ({len(frs)}):** {titles}")
    if timeline := req.get("timeline"):
        bullets.append(f"**Timeline:** {timeline}")
    constraints = req.get("constraints") or []
    if constraints:
        bullets.append(f"**Constraints:** {', '.join(constraints[:2])}")

    bullet_text = "\n".join(f"• {b}" for b in bullets) if bullets else "• (No details captured yet)"
    return (
        f"Here is what I captured:\n\n{bullet_text}\n\n"
        "Please review — click **Confirm & PM Review** when satisfied, or let me know what needs adjusting."
    )


def gather_node(state: RequirementsState) -> dict:
    messages = state.get("messages", [])
    system_prompt = _build_system_prompt(state)

    lc_messages: list = [SystemMessage(content=system_prompt)]

    if not messages:
        lc_messages.append(HumanMessage(content="Begin the session now."))
    else:
        for m in messages:
            if m["role"] == "user":
                lc_messages.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                lc_messages.append(AIMessage(content=m["content"]))

    response = _llm.invoke(lc_messages)

    return {
        "messages": [{"role": "assistant", "content": response.content}],
        "phase": state.get("phase", "gathering"),
    }


def extract_node(state: RequirementsState) -> dict:
    messages = state.get("messages", [])
    conversation = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in messages
    )

    prompt = EXTRACT_PROMPT.format(conversation=conversation)
    response = _llm.invoke([HumanMessage(content=prompt)])

    parsed = _parse_json(response.content)
    if not parsed:
        parsed = {"error": "Failed to parse requirements", "raw": response.content.strip()}

    completeness_score, vague_areas = _compute_completeness(parsed)
    confirm_message = _build_confirm_message(parsed)

    return {
        "requirements": parsed,
        "phase": "confirming",
        "completeness_score": completeness_score,
        "vague_areas": vague_areas,
        "messages": [{"role": "assistant", "content": confirm_message}],
    }


def pm_review_node(state: RequirementsState) -> dict:
    requirements = state.get("requirements", {})
    prompt = PM_REVIEW_PROMPT.format(requirements=json.dumps(requirements, indent=2))
    response = _pm_llm.invoke([HumanMessage(content=prompt)])

    review = _parse_json(response.content)
    if not review:
        review = {
            "status": "approved",
            "feasibility_score": 70,
            "feedback": response.content.strip()[:300],
            "strengths": [],
            "gaps": [],
            "recommendations": [],
        }

    status = review.get("status", "approved")
    feedback_text = review.get("feedback", "")
    gaps = review.get("gaps", [])
    recommendations = review.get("recommendations", [])

    if status == "approved":
        pm_message = (
            f"Great news — the PM has reviewed and **approved** the requirements.\n\n{feedback_text}"
        )
        if recommendations:
            pm_message += "\n\n**Recommendations:**\n" + "\n".join(f"• {r}" for r in recommendations)
        # Only mark done on approval — needs_clarification keeps the session open
        next_phase = "done"
    else:
        pm_message = (
            f"The PM reviewed the requirements and flagged a few things worth addressing before "
            f"we move forward.\n\n{feedback_text}"
        )
        if gaps:
            pm_message += "\n\n**Open questions:**\n" + "\n".join(f"• {g}" for g in gaps)
        if recommendations:
            pm_message += "\n\n**Suggestions:**\n" + "\n".join(f"• {r}" for r in recommendations)
        pm_message += (
            "\n\nWant to go through these quickly? Chat with me to fill in the gaps, "
            "then click **Finalize** again — it usually only takes a minute or two. "
            "Or click **Start Work Anyway** if you'd rather proceed as-is."
        )
        # Keep session in confirming so user can iterate — chat, re-finalize, re-confirm
        next_phase = "confirming"

    return {
        "review_status": status,
        "review_feedback": review.get("feedback", ""),
        "review_gaps": gaps,
        "review_strengths": review.get("strengths", []),
        "review_recommendations": recommendations,
        "feasibility_score": int(review.get("feasibility_score", 70)),
        "phase": next_phase,
        "messages": [{"role": "assistant", "content": pm_message}],
    }
