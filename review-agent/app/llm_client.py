"""Provider-agnostic chat call used by the review agent's own judge logic.

Defaults to Anthropic (the marketplace spec's decided stack). Set LLM_PROVIDER=xai or
LLM_PROVIDER=groq in .env to route through Grok or Groq instead — useful for local POC runs
without an Anthropic key. Swapping back is a one-line env change; nothing in
app/pipeline/judge.py needs to change.
"""
from app.config import (
    ANTHROPIC_API_KEY,
    GROQ_API_KEY,
    GROQ_MODEL,
    JUDGE_MODEL,
    LLM_PROVIDER,
    XAI_API_KEY,
    XAI_MODEL,
)

_anthropic_client = None
_xai_client = None
_groq_client = None


def _anthropic() -> "Anthropic":
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic
        _anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


def _xai() -> "OpenAI":
    global _xai_client
    if _xai_client is None:
        from openai import OpenAI
        _xai_client = OpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")
    return _xai_client


def _groq() -> "OpenAI":
    global _groq_client
    if _groq_client is None:
        from openai import OpenAI
        _groq_client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
    return _groq_client


def chat(system: str, user: str, max_tokens: int = 1000) -> str:
    """Single-turn system+user call, returns the assistant's text response."""
    if LLM_PROVIDER == "xai":
        response = _xai().chat.completions.create(
            model=XAI_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        return response.choices[0].message.content or ""

    if LLM_PROVIDER == "groq":
        response = _groq().chat.completions.create(
            model=GROQ_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        return response.choices[0].message.content or ""

    response = _anthropic().messages.create(
        model=JUDGE_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in response.content if hasattr(block, "text"))
