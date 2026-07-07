"""Provider toggle for this agent's own generation calls. Defaults to Anthropic per the
platform's SDK contract (ANTHROPIC_API_KEY is the only key the platform injects in
production). LLM_PROVIDER=xai/groq is a review-agent test-harness convenience only, used
when exercising this fixture locally without an Anthropic key.
"""
import os


def generate(system: str, user: str, max_tokens: int = 1500) -> str:
    provider = os.getenv("LLM_PROVIDER")

    if provider == "xai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("XAI_API_KEY"), base_url="https://api.x.ai/v1")
        response = client.chat.completions.create(
            model=os.getenv("XAI_MODEL", "grok-4"),
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        return response.choices[0].message.content or ""

    if provider == "groq":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")
        response = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        return response.choices[0].message.content or ""

    from anthropic import Anthropic
    client = Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in response.content if hasattr(block, "text"))
