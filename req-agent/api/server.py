import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent.graph import graph

app = FastAPI(title="Requirements Gathering Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LISTINGS_DB = DATA_DIR / "listings.db"

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


# ---------- DB ----------

def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(LISTINGS_DB), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS listings (
            listing_id   TEXT PRIMARY KEY,
            created_at   TEXT NOT NULL,
            name         TEXT NOT NULL,
            seller       TEXT NOT NULL,
            category     TEXT NOT NULL,
            description  TEXT NOT NULL,
            use_cases    TEXT NOT NULL,
            requirements TEXT NOT NULL,
            tags         TEXT NOT NULL,
            hourly_rate  REAL NOT NULL,
            avg_hours    REAL NOT NULL,
            status       TEXT NOT NULL DEFAULT 'pending_review',
            archive_filename TEXT,
            archive_path TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token      TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_feedback (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            rating      INTEGER NOT NULL,
            liked       TEXT,
            disliked    TEXT,
            suggestions TEXT,
            created_at  TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def _require_admin(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.removeprefix("Bearer ").strip()
    conn = _get_db()
    row = conn.execute("SELECT expires_at FROM admin_sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid token")
    if datetime.fromisoformat(row["expires_at"]) < datetime.now():
        raise HTTPException(status_code=401, detail="Token expired")


# ---------- Models ----------

VALID_TOPICS = {"general", "mobile_app", "web_app", "api"}
VALID_MODES  = {"conversation", "form"}

class CreateSessionRequest(BaseModel):
    topic: str = "general"
    mode:  str = "conversation"

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
    completeness_score: int = 0

class FinalizeResponse(BaseModel):
    requirements: dict
    json_path: str
    markdown_path: str
    transcript_path: str
    completeness_score: int = 0
    vague_areas: list[str] = []
    phase: str = "confirming"
    confirm_message: str = ""

class ConfirmResponse(BaseModel):
    requirements: dict
    json_path: str
    markdown_path: str
    transcript_path: str
    review_status: str
    review_feedback: str
    review_gaps: list[str]
    review_strengths: list[str]
    feasibility_score: int

class FeedbackRequest(BaseModel):
    rating: int
    liked: str = ""
    disliked: str = ""
    suggestions: str = ""

class ListingRequest(BaseModel):
    name: str
    seller: str
    category: str
    description: str
    use_cases: list[str]
    requirements: list[str]
    tags: list[str]
    hourly_rate: float
    avg_hours: float

class ListingResponse(BaseModel):
    listing_id: str
    name: str
    status: str

class StatusUpdate(BaseModel):
    status: str

class TaskRequest(BaseModel):
    agent_id: str
    agent_name: str
    agent_category: str
    requirements: dict

class TaskResponse(BaseModel):
    task_id: str
    agent_name: str
    status: str
    output: str

class LoginRequest(BaseModel):
    password: str


# ---------- Helpers ----------

def _config(session_id: str) -> dict:
    return {"configurable": {"thread_id": session_id}}


def _require_session(session_id: str) -> dict:
    state = graph.get_state(_config(session_id))
    if not state.values:
        raise HTTPException(status_code=404, detail="Session not found")
    return state.values


def _last_assistant_msg(state_values) -> str:
    msgs = state_values.get("messages", []) if isinstance(state_values, dict) else []
    for m in reversed(msgs):
        if m.get("role") == "assistant":
            return m["content"]
    return ""


def _score_requirements(req: dict) -> tuple[int, list[str]]:
    fields = {
        "project_name": 10, "project_overview": 15, "goals": 15,
        "functional_requirements": 20, "non_functional_requirements": 10,
        "constraints": 10, "stakeholders": 5, "timeline": 10, "out_of_scope": 5,
    }
    score, vague = 0, []
    for field, weight in fields.items():
        val = req.get(field)
        if val and val != [] and val != "":
            score += weight
        else:
            vague.append(field.replace("_", " ").title())
    return min(score, 100), vague


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
    json_path      = OUTPUT_DIR / f"{base}.json"
    md_path        = OUTPUT_DIR / f"{base}.md"
    transcript_path = OUTPUT_DIR / f"{base}_transcript.md"
    json_path.write_text(json.dumps(requirements, indent=2))
    md_path.write_text(_to_markdown(requirements))
    transcript_path.write_text(_to_transcript(messages, session_id))
    return str(json_path), str(md_path), str(transcript_path)


def _run_pm_review(requirements: dict) -> dict:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage

    provider = os.getenv("LLM_PROVIDER", "groq")
    if provider == "groq":
        llm = ChatOpenAI(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            openai_api_key=os.getenv("GROQ_API_KEY"),
            openai_api_base="https://api.groq.com/openai/v1",
            temperature=0.3,
        )
    else:
        llm = ChatOpenAI(
            model=os.getenv("XAI_MODEL", "grok-4"),
            openai_api_key=os.getenv("XAI_API_KEY"),
            openai_api_base="https://api.x.ai/v1",
            temperature=0.3,
        )

    prompt = f"""You are a senior PM reviewing a requirements document. Evaluate it and return ONLY valid JSON.

Requirements:
{json.dumps(requirements, indent=2)}

Return this exact JSON shape:
{{
  "status": "approved" or "needs_clarification",
  "feedback": "2-3 sentence overall assessment",
  "gaps": ["gap1", "gap2"],
  "strengths": ["strength1", "strength2"],
  "feasibility_score": 0-100
}}"""

    response = llm.invoke([SystemMessage(content="You are a PM reviewer. Return only valid JSON."),
                           HumanMessage(content=prompt)])
    content = response.content.strip()
    try:
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        return json.loads(match.group() if match else content)
    except Exception:
        return {"status": "approved", "feedback": "Requirements look good.", "gaps": [], "strengths": [], "feasibility_score": 75}


def _run_agent_task(agent_name: str, category: str, requirements: dict) -> str:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage

    provider = os.getenv("LLM_PROVIDER", "groq")
    if provider == "groq":
        llm = ChatOpenAI(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            openai_api_key=os.getenv("GROQ_API_KEY"),
            openai_api_base="https://api.groq.com/openai/v1",
            temperature=0.4,
        )
    else:
        llm = ChatOpenAI(
            model=os.getenv("XAI_MODEL", "grok-4"),
            openai_api_key=os.getenv("XAI_API_KEY"),
            openai_api_base="https://api.x.ai/v1",
            temperature=0.4,
        )

    system = f"You are {agent_name}, a specialised AI agent in the {category} category. Execute the given task and return detailed, professional output in clean markdown."
    user   = f"Task specification:\n{json.dumps(requirements, indent=2)}\n\nExecute this task now and return the full output."
    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    return response.content


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["use_cases"]    = json.loads(d["use_cases"])
    d["requirements"] = json.loads(d["requirements"])
    d["tags"]         = json.loads(d["tags"])
    return d


# ---------- Session routes ----------

@app.post("/sessions", response_model=SessionCreatedResponse)
def create_session(request: CreateSessionRequest = CreateSessionRequest()):
    topic = request.topic if request.topic in VALID_TOPICS else "general"
    mode  = request.mode  if request.mode  in VALID_MODES  else "conversation"
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
        raise HTTPException(status_code=400, detail="Session already finalized.")
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
        messages     = values.get("messages", [])
    else:
        result       = graph.invoke({"messages": [], "phase": "extracting"}, config=_config(session_id))
        requirements = result.get("requirements", {})
        messages     = graph.get_state(_config(session_id)).values.get("messages", [])

    score, vague = _score_requirements(requirements)
    confirm_msg  = f"I've gathered your requirements (completeness: {score}%). Please review and confirm, or keep refining."

    return FinalizeResponse(
        requirements=requirements,
        json_path="", markdown_path="", transcript_path="",
        completeness_score=score,
        vague_areas=vague,
        phase="confirming",
        confirm_message=confirm_msg,
    )


@app.post("/sessions/{session_id}/confirm", response_model=ConfirmResponse)
def confirm_session(session_id: str):
    values       = _require_session(session_id)
    requirements = values.get("requirements", {})
    messages     = values.get("messages", [])

    review = _run_pm_review(requirements)
    json_path, md_path, transcript_path = _write_output_files(requirements, messages, session_id)

    return ConfirmResponse(
        requirements=requirements,
        json_path=str(json_path), markdown_path=str(md_path), transcript_path=str(transcript_path),
        review_status=review.get("status", "approved"),
        review_feedback=review.get("feedback", ""),
        review_gaps=review.get("gaps", []),
        review_strengths=review.get("strengths", []),
        feasibility_score=review.get("feasibility_score", 75),
    )


@app.post("/sessions/{session_id}/feedback")
def submit_feedback(session_id: str, body: FeedbackRequest):
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="rating must be 1–5")
    conn = _get_db()
    conn.execute(
        "INSERT INTO session_feedback (session_id, rating, liked, disliked, suggestions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (session_id, body.rating, body.liked, body.disliked, body.suggestions, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


@app.get("/sessions/{session_id}/requirements")
def get_requirements(session_id: str):
    values = _require_session(session_id)
    return {"phase": values.get("phase"), "requirements": values.get("requirements", {})}


# ---------- Listings ----------

@app.post("/listings", response_model=ListingResponse)
def create_listing(request: ListingRequest):
    listing_id = str(uuid.uuid4())[:8].upper()
    conn = _get_db()
    conn.execute(
        """INSERT INTO listings (listing_id, created_at, name, seller, category, description, use_cases, requirements, tags, hourly_rate, avg_hours, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')""",
        (listing_id, datetime.now().isoformat(), request.name, request.seller, request.category,
         request.description, json.dumps(request.use_cases), json.dumps(request.requirements),
         json.dumps(request.tags), request.hourly_rate, request.avg_hours),
    )
    conn.commit()
    conn.close()
    return ListingResponse(listing_id=listing_id, name=request.name, status="pending_review")


@app.get("/listings")
def get_listings():
    conn = _get_db()
    rows = conn.execute("SELECT * FROM listings ORDER BY created_at DESC").fetchall()
    conn.close()
    return {"listings": [_row_to_dict(r) for r in rows]}


@app.get("/listings/{listing_id}")
def get_listing(listing_id: str):
    conn = _get_db()
    row = conn.execute("SELECT * FROM listings WHERE listing_id = ?", (listing_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _row_to_dict(row)


@app.post("/listings/{listing_id}/upload")
async def upload_archive(listing_id: str, file: UploadFile = File(...)):
    conn = _get_db()
    row = conn.execute("SELECT listing_id FROM listings WHERE listing_id = ?", (listing_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Listing not found")
    filename = file.filename or "archive.tar.gz"
    dest = UPLOADS_DIR / f"{listing_id}_{filename}"
    contents = await file.read()
    dest.write_bytes(contents)
    conn.execute("UPDATE listings SET archive_filename = ?, archive_path = ? WHERE listing_id = ?",
                 (filename, str(dest), listing_id))
    conn.commit()
    conn.close()
    return {"listing_id": listing_id, "filename": filename, "size_bytes": len(contents), "status": "uploaded"}


@app.patch("/listings/{listing_id}/status")
def update_listing_status(listing_id: str, body: StatusUpdate, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    valid = {"approved", "rejected", "pending_review"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid}")
    conn = _get_db()
    result = conn.execute("UPDATE listings SET status = ? WHERE listing_id = ?", (body.status, listing_id))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"listing_id": listing_id, "status": body.status}


# ---------- Tasks ----------

@app.post("/tasks", response_model=TaskResponse)
def run_task(request: TaskRequest):
    task_id = str(uuid.uuid4())[:8].upper()
    output  = _run_agent_task(request.agent_name, request.agent_category, request.requirements)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = request.agent_name.lower().replace(" ", "_")[:30]
    out_path = OUTPUT_DIR / f"task_{slug}_{timestamp}.md"
    out_path.write_text(f"# Task Output — {request.agent_name}\n\n{output}")
    return TaskResponse(task_id=task_id, agent_name=request.agent_name, status="completed", output=output)


# ---------- Admin ----------

@app.post("/admin/login")
def admin_login(body: LoginRequest):
    expected = os.getenv("ADMIN_PASSWORD", "")
    if not expected or body.password != expected:
        raise HTTPException(status_code=401, detail="Invalid password")
    token   = str(uuid.uuid4())
    expires = (datetime.now() + timedelta(hours=8)).isoformat()
    conn    = _get_db()
    conn.execute("INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
                 (token, datetime.now().isoformat(), expires))
    conn.commit()
    conn.close()
    return {"token": token, "expires_at": expires}


@app.post("/admin/logout")
def admin_logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        conn  = _get_db()
        conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    return {"status": "logged out"}


@app.get("/admin/feedback")
def get_feedback(authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    conn = _get_db()
    rows = conn.execute("SELECT * FROM session_feedback ORDER BY created_at DESC").fetchall()
    conn.close()
    return {"feedback": [dict(r) for r in rows], "total": len(rows)}


@app.get("/health")
def health():
    return {"status": "ok"}
