from typing import TypedDict, Annotated
import operator


class RequirementsState(TypedDict):
    messages: Annotated[list[dict], operator.add]  # {"role": "user"|"assistant", "content": str}
    phase: str     # "gathering" | "extracting" | "confirming" | "reviewing" | "done"
    requirements: dict
    session_id: str
    topic: str     # "general" | "mobile_app" | "web_app" | "api"
    mode: str      # "conversation" | "form"
    # Completeness scoring (populated after extraction)
    completeness_score: int    # 0-100
    vague_areas: list[str]
    # PM review (populated after confirm)
    review_status: str         # "pending" | "approved" | "needs_clarification"
    review_feedback: str
    review_gaps: list[str]
    review_strengths: list[str]
    review_recommendations: list[str]
    feasibility_score: int     # 0-100
    # Output file paths (written on every confirm call)
    output_json_path: str
    output_md_path: str
    output_transcript_path: str
