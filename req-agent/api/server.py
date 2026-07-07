import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from agent.graph import graph

app = FastAPI(title="Requirements Gathering Agent", version="1.0.0")

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# ---------- Request / Response models ----------

VALID_TOPICS = {"general", "mobile_app", "web_app", "api"}
VALID_MODES = {"conversation", "form"}

class CreateSessionRequest(BaseModel):
    topic: str = "general"
    mode: str = "conversation"

class ChatRequest(BaseModel):
    message: str

class SessionCreatedResponse(BaseModel):
    session_id: str
    message: str
    topic: str
    mode: str

class ChatResponse(BaseModel):
    session_id: str
    message: str
    phase: str

class FinalizeResponse(BaseModel):
    requirements: dict
    json_path: str
    markdown_path: str
    transcript_path: str


# ---------- Helpers ----------

def _config(session_id: str) -> dict:
    return {"configurable": {"thread_id": session_id}}


def _require_session(session_id: str) -> dict:
    """Load session state from SQLite or raise 404."""
    state = graph.get_state(_config(session_id))
    if not state.values:
        raise HTTPException(status_code=404, detail="Session not found")
    return state.values


def _last_assistant_msg(state_values: dict) -> str:
    for m in reversed(state_values.get("messages", [])):
        if m.get("role") == "assistant":
            return m["content"]
    return ""


def _to_markdown(req: dict) -> str:
    lines = [f"# Requirements: {req.get('project_name', 'Untitled Project')}\n"]

    if overview := req.get("project_overview"):
        lines += ["## Overview\n", overview, ""]

    if goals := req.get("goals"):
        lines += ["## Goals", *[f"- {g}" for g in goals], ""]

    if frs := req.get("functional_requirements"):
        lines.append("## Functional Requirements\n")
        for fr in frs:
            pri = fr.get("priority", "medium").upper()
            lines += [f"### {fr.get('id')} — {fr.get('title')} `[{pri}]`", fr.get("description", ""), ""]

    if nfrs := req.get("non_functional_requirements"):
        lines.append("## Non-Functional Requirements\n")
        for nfr in nfrs:
            lines += [f"### {nfr.get('id')} — {nfr.get('category', '').title()}", nfr.get("description", ""), ""]

    if constraints := req.get("constraints"):
        lines += ["## Constraints", *[f"- {c}" for c in constraints], ""]

    if stakeholders := req.get("stakeholders"):
        lines += ["## Stakeholders", *[f"- {s}" for s in stakeholders], ""]

    if timeline := req.get("timeline"):
        lines += ["## Timeline", timeline, ""]

    if oos := req.get("out_of_scope"):
        lines += ["## Out of Scope", *[f"- {o}" for o in oos], ""]

    if oq := req.get("open_questions"):
        lines += ["## Open Questions", *[f"- {q}" for q in oq], ""]

    return "\n".join(lines)


def _to_transcript(messages: list[dict], session_id: str) -> str:
    lines = [
        "# Requirements Session Transcript",
        f"**Session ID:** {session_id}",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "\n---\n",
    ]
    for m in messages:
        role = "You" if m["role"] == "user" else "Agent"
        lines += [f"**{role}:** {m['content']}", ""]
    return "\n".join(lines)


def _write_output_files(requirements: dict, messages: list[dict], session_id: str) -> tuple[str, str, str]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = requirements.get("project_name", "project").lower().replace(" ", "_")[:40]
    base = f"{slug}_{timestamp}"

    json_path = OUTPUT_DIR / f"{base}.json"
    md_path = OUTPUT_DIR / f"{base}.md"
    transcript_path = OUTPUT_DIR / f"{base}_transcript.md"

    json_path.write_text(json.dumps(requirements, indent=2))
    md_path.write_text(_to_markdown(requirements))
    transcript_path.write_text(_to_transcript(messages, session_id))

    return str(json_path), str(md_path), str(transcript_path)


# ---------- Routes ----------

@app.post("/sessions", response_model=SessionCreatedResponse)
def create_session(request: CreateSessionRequest = CreateSessionRequest()):
    topic = request.topic if request.topic in VALID_TOPICS else "general"
    mode = request.mode if request.mode in VALID_MODES else "conversation"

    session_id = str(uuid.uuid4())

    result = graph.invoke(
        {"messages": [], "phase": "gathering", "requirements": {}, "session_id": session_id, "topic": topic, "mode": mode},
        config=_config(session_id),
    )
    return SessionCreatedResponse(session_id=session_id, message=_last_assistant_msg(result), topic=topic, mode=mode)


@app.post("/sessions/{session_id}/chat", response_model=ChatResponse)
def chat(session_id: str, request: ChatRequest):
    values = _require_session(session_id)

    if values.get("phase") == "done":
        raise HTTPException(status_code=400, detail="Session already finalized. Use POST /sessions/{id}/finalize.")

    result = graph.invoke(
        {"messages": [{"role": "user", "content": request.message}]},
        config=_config(session_id),
    )
    return ChatResponse(session_id=session_id, message=_last_assistant_msg(result), phase=result.get("phase", "gathering"))


@app.post("/sessions/{session_id}/finalize", response_model=FinalizeResponse)
def finalize(session_id: str):
    values = _require_session(session_id)

    if values.get("phase") == "done":
        requirements = values.get("requirements", {})
        messages = values.get("messages", [])
    else:
        result = graph.invoke({"messages": [], "phase": "extracting"}, config=_config(session_id))
        requirements = result.get("requirements", {})
        messages = graph.get_state(_config(session_id)).values.get("messages", [])

    json_path, md_path, transcript_path = _write_output_files(requirements, messages, session_id)
    return FinalizeResponse(requirements=requirements, json_path=json_path, markdown_path=md_path, transcript_path=transcript_path)


@app.get("/sessions/{session_id}/requirements")
def get_requirements(session_id: str):
    values = _require_session(session_id)
    return {"phase": values.get("phase"), "requirements": values.get("requirements", {})}


@app.get("/health")
def health():
    return {"status": "ok"}
