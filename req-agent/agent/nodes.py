import json
import re
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from .state import RequirementsState
from .prompts import CONVERSATION_SYSTEM, FORM_SYSTEM, TOPIC_EXTRAS, EXTRACT_PROMPT

load_dotenv()

# Provider toggle, same convention as review-agent/app/config.py and the seller-facing
# llm.py pattern in SELLER_GUIDE.md. Defaults to xAI/Grok — the platform's decided LLM
# for its own internally-owned agents (req-agent, review-agent), not to be confused with
# the per-provider credentials passed through to third-party worker agents.
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
}

_cfg = _PROVIDER_CONFIG.get(_PROVIDER, _PROVIDER_CONFIG["xai"])
_llm = ChatOpenAI(temperature=0.7, **_cfg)


def _build_system_prompt(state: RequirementsState) -> str:
    mode = state.get("mode", "conversation")
    topic = state.get("topic", "general")
    extra = TOPIC_EXTRAS.get(topic, "")
    template = FORM_SYSTEM if mode == "form" else CONVERSATION_SYSTEM
    return template.format(extra=extra)


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
        "phase": "gathering",
    }


def extract_node(state: RequirementsState) -> dict:
    messages = state.get("messages", [])
    conversation = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in messages
    )

    prompt = EXTRACT_PROMPT.format(conversation=conversation)
    response = _llm.invoke([HumanMessage(content=prompt)])

    content = response.content.strip()
    try:
        requirements = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            requirements = json.loads(match.group())
        else:
            requirements = {"error": "Failed to parse requirements", "raw": content}

    return {
        "requirements": requirements,
        "phase": "done",
    }
