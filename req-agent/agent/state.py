from typing import TypedDict, Annotated
import operator


class RequirementsState(TypedDict):
    messages: Annotated[list[dict], operator.add]  # {"role": "user"|"assistant", "content": str}
    phase: str                                       # "gathering" | "extracting" | "done"
    requirements: dict                               # structured output, populated after extraction
    session_id: str
    topic: str                                       # "general" | "mobile_app" | "web_app" | "api"
    mode: str                                        # "conversation" | "form"
