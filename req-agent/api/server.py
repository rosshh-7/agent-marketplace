import csv
import io
import json
import mimetypes
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from agent.graph import graph

app = FastAPI(title="Requirements Gathering Agent", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
META_DB = DATA_DIR / "meta.db"


# ---------- Meta DB ----------

def _get_meta_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(META_DB), check_same_thread=False)
    conn.row_factory = sqlite3.Row
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_outputs (
            session_id      TEXT PRIMARY KEY,
            json_path       TEXT NOT NULL,
            md_path         TEXT NOT NULL,
            transcript_path TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def _save_output_paths(session_id: str, json_path: str, md_path: str, transcript_path: str) -> None:
    conn = _get_meta_conn()
    conn.execute(
        """INSERT INTO session_outputs (session_id, json_path, md_path, transcript_path, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
               json_path=excluded.json_path,
               md_path=excluded.md_path,
               transcript_path=excluded.transcript_path,
               updated_at=excluded.updated_at""",
        (session_id, json_path, md_path, transcript_path, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


def _get_output_paths(session_id: str) -> dict | None:
    conn = _get_meta_conn()
    row = conn.execute(
        "SELECT json_path, md_path, transcript_path FROM session_outputs WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def _require_admin(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.removeprefix("Bearer ").strip()
    conn = _get_meta_conn()
    row = conn.execute(
        "SELECT expires_at FROM admin_sessions WHERE token = ?", (token,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid token")
    if datetime.fromisoformat(row["expires_at"]) < datetime.now():
        raise HTTPException(status_code=401, detail="Token expired")


# ---------- Request / Response models ----------

VALID_TOPICS = {"general", "mobile_app", "web_app", "api"}
VALID_MODES = {"conversation", "form"}
VALID_FORMATS = {"md", "json", "transcript"}


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
    phase: str                  # "done" | "confirming" (needs_clarification keeps session open)
    review_status: str
    review_feedback: str
    review_gaps: list[str]
    review_strengths: list[str]
    review_recommendations: list[str]
    feasibility_score: int


class FeedbackRequest(BaseModel):
    rating: int
    liked: str = ""
    disliked: str = ""
    suggestions: str = ""


# ---------- Helpers ----------

def _config(session_id: str) -> dict:
    return {"configurable": {"thread_id": session_id}}


def _require_session(session_id: str) -> dict:
    state = graph.get_state(_config(session_id))
    if not state.values:
        raise HTTPException(status_code=404, detail="Session not found")
    return state.values


def _last_assistant_msg(state_values: dict) -> str:
    for m in reversed(state_values.get("messages", [])):
        if m.get("role") == "assistant":
            return m["content"]
    return ""


def _to_markdown(req: dict, review: dict | None = None) -> str:
    lines = [f"# Requirements: {req.get('project_name', 'Untitled Project')}\n"]
    lines += [f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*", ""]

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
            lines += [
                f"### {nfr.get('id')} — {nfr.get('category', '').title()}",
                nfr.get("description", ""), "",
            ]

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

    # Append PM review section if available
    if review:
        lines += ["", "---", "", "## PM Review"]
        status = review.get("review_status", "")
        score = review.get("feasibility_score", 0)
        lines += [
            f"**Status:** {status.replace('_', ' ').title()}  ",
            f"**Feasibility:** {score}/100",
            "",
        ]
        if feedback := review.get("review_feedback"):
            lines += [feedback, ""]
        if strengths := review.get("review_strengths"):
            lines += ["### Strengths", *[f"- {s}" for s in strengths], ""]
        if gaps := review.get("review_gaps"):
            lines += ["### Open Questions", *[f"- {g}" for g in gaps], ""]
        if recs := review.get("review_recommendations"):
            lines += ["### Recommendations", *[f"- {r}" for r in recs], ""]

    return "\n".join(lines)


def _to_transcript(messages: list[dict], session_id: str) -> str:
    lines = [
        "# Requirements Session Transcript",
        f"**Session ID:** {session_id}",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "\n---\n",
    ]
    for m in messages:
        role = "You" if m["role"] == "user" else "Alex"
        lines += [f"**{role}:** {m['content']}", ""]
    return "\n".join(lines)


def _write_output_files(
    requirements: dict,
    messages: list[dict],
    session_id: str,
    review: dict | None = None,
) -> tuple[str, str, str]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = requirements.get("project_name", "project").lower().replace(" ", "_")[:40]
    base = f"{slug}_{timestamp}"

    json_path = OUTPUT_DIR / f"{base}.json"
    md_path = OUTPUT_DIR / f"{base}.md"
    transcript_path = OUTPUT_DIR / f"{base}_transcript.md"

    json_path.write_text(json.dumps(requirements, indent=2))
    md_path.write_text(_to_markdown(requirements, review=review))
    transcript_path.write_text(_to_transcript(messages, session_id))

    _save_output_paths(session_id, str(json_path), str(md_path), str(transcript_path))

    return str(json_path), str(md_path), str(transcript_path)


# ---------- Session routes ----------

@app.post("/sessions", response_model=SessionCreatedResponse)
def create_session(request: CreateSessionRequest = CreateSessionRequest()):
    topic = request.topic if request.topic in VALID_TOPICS else "general"
    mode = request.mode if request.mode in VALID_MODES else "conversation"
    session_id = str(uuid.uuid4())

    result = graph.invoke(
        {
            "messages": [], "phase": "gathering", "requirements": {},
            "session_id": session_id, "topic": topic, "mode": mode,
            "completeness_score": 0, "vague_areas": [],
            "review_status": "pending", "review_feedback": "",
            "review_gaps": [], "review_strengths": [], "review_recommendations": [],
            "feasibility_score": 0,
            "output_json_path": "", "output_md_path": "", "output_transcript_path": "",
        },
        config=_config(session_id),
    )
    return SessionCreatedResponse(
        session_id=session_id,
        message=_last_assistant_msg(result),
        topic=topic,
        mode=mode,
    )


@app.post("/sessions/{session_id}/chat", response_model=ChatResponse)
def chat(session_id: str, request: ChatRequest):
    values = _require_session(session_id)

    if values.get("phase") == "done":
        raise HTTPException(status_code=400, detail="Session is complete. Start a new session or use /requirements.")

    result = graph.invoke(
        {"messages": [{"role": "user", "content": request.message}]},
        config=_config(session_id),
    )
    state_after = graph.get_state(_config(session_id)).values
    return ChatResponse(
        session_id=session_id,
        message=_last_assistant_msg(result),
        phase=result.get("phase", "gathering"),
        completeness_score=state_after.get("completeness_score", 0),
    )


@app.post("/sessions/{session_id}/finalize", response_model=FinalizeResponse)
def finalize(session_id: str):
    values = _require_session(session_id)
    phase = values.get("phase", "gathering")

    if phase == "confirming":
        # Already extracted — return current state (user may have chatted to adjust)
        # Re-extract to pick up any changes made during confirming chat
        graph.invoke({"messages": [], "phase": "extracting"}, config=_config(session_id))
        state_after = graph.get_state(_config(session_id)).values
        return FinalizeResponse(
            requirements=state_after.get("requirements", {}),
            json_path="", markdown_path="", transcript_path="",
            completeness_score=state_after.get("completeness_score", 0),
            vague_areas=state_after.get("vague_areas", []),
            phase="confirming",
            confirm_message=_last_assistant_msg(state_after),
        )

    if phase == "done":
        requirements = values.get("requirements", {})
        messages = values.get("messages", [])
        paths = _get_output_paths(session_id)
        if not paths:
            json_path, md_path, transcript_path = _write_output_files(requirements, messages, session_id)
        else:
            json_path, md_path, transcript_path = paths["json_path"], paths["md_path"], paths["transcript_path"]
        return FinalizeResponse(
            requirements=requirements,
            json_path=json_path, markdown_path=md_path, transcript_path=transcript_path,
            completeness_score=values.get("completeness_score", 0),
            vague_areas=values.get("vague_areas", []),
            phase="done",
            confirm_message="",
        )

    # Trigger extraction → moves to confirming phase
    graph.invoke({"messages": [], "phase": "extracting"}, config=_config(session_id))
    state_after = graph.get_state(_config(session_id)).values

    return FinalizeResponse(
        requirements=state_after.get("requirements", {}),
        json_path="", markdown_path="", transcript_path="",
        completeness_score=state_after.get("completeness_score", 0),
        vague_areas=state_after.get("vague_areas", []),
        phase="confirming",
        confirm_message=_last_assistant_msg(state_after),
    )


@app.post("/sessions/{session_id}/confirm", response_model=ConfirmResponse)
def confirm_session(session_id: str):
    values = _require_session(session_id)
    phase = values.get("phase", "gathering")

    if phase not in ("confirming", "gathering", "done"):
        raise HTTPException(status_code=400, detail=f"Cannot confirm from phase '{phase}'.")

    if phase == "done":
        # Already approved — return cached output
        requirements = values.get("requirements", {})
        messages = values.get("messages", [])
        paths = _get_output_paths(session_id)
        if not paths:
            json_path, md_path, transcript_path = _write_output_files(requirements, messages, session_id)
        else:
            json_path, md_path, transcript_path = paths["json_path"], paths["md_path"], paths["transcript_path"]
        return ConfirmResponse(
            requirements=requirements,
            json_path=json_path, markdown_path=md_path, transcript_path=transcript_path,
            phase="done",
            review_status=values.get("review_status", "approved"),
            review_feedback=values.get("review_feedback", ""),
            review_gaps=values.get("review_gaps", []),
            review_strengths=values.get("review_strengths", []),
            review_recommendations=values.get("review_recommendations", []),
            feasibility_score=values.get("feasibility_score", 0),
        )

    # Trigger PM review
    graph.invoke({"phase": "reviewing"}, config=_config(session_id))
    state_after = graph.get_state(_config(session_id)).values
    requirements = state_after.get("requirements", {})
    messages = state_after.get("messages", [])

    review_data = {
        "review_status": state_after.get("review_status", "approved"),
        "review_feedback": state_after.get("review_feedback", ""),
        "review_gaps": state_after.get("review_gaps", []),
        "review_strengths": state_after.get("review_strengths", []),
        "review_recommendations": state_after.get("review_recommendations", []),
        "feasibility_score": state_after.get("feasibility_score", 0),
    }

    # Always write output files — even for needs_clarification (draft state)
    json_path, md_path, transcript_path = _write_output_files(
        requirements, messages, session_id, review=review_data
    )

    return ConfirmResponse(
        requirements=requirements,
        json_path=json_path, markdown_path=md_path, transcript_path=transcript_path,
        phase=state_after.get("phase", "confirming"),
        **review_data,
    )


@app.get("/sessions/{session_id}/requirements")
def get_requirements(session_id: str):
    values = _require_session(session_id)
    return {"phase": values.get("phase"), "requirements": values.get("requirements", {})}


# ---------- Download output files ----------

@app.get("/sessions/{session_id}/download")
def download_output(
    session_id: str,
    format: str = Query(default="md", pattern="^(md|json|transcript)$"),
):
    """Serve the generated requirements file (md, json, or transcript).
    Files are written on every /confirm call and persist on disk."""
    _require_session(session_id)  # 404 if session doesn't exist
    paths = _get_output_paths(session_id)
    if not paths:
        raise HTTPException(
            status_code=404,
            detail="No output files found. Call POST /sessions/{id}/confirm first.",
        )

    if format == "md":
        file_path = Path(paths["md_path"])
        media_type = "text/markdown"
        filename_suffix = ".md"
    elif format == "json":
        file_path = Path(paths["json_path"])
        media_type = "application/json"
        filename_suffix = ".json"
    else:
        file_path = Path(paths["transcript_path"])
        media_type = "text/markdown"
        filename_suffix = "_transcript.md"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Output file not found on disk.")

    content = file_path.read_text()
    slug = file_path.stem[:40]
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{slug}{filename_suffix}"'},
    )


# ---------- Feedback ----------

@app.post("/sessions/{session_id}/feedback")
def submit_feedback(session_id: str, body: FeedbackRequest):
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="rating must be 1–5")
    conn = _get_meta_conn()
    conn.execute(
        """INSERT INTO session_feedback (session_id, rating, liked, disliked, suggestions, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, body.rating, body.liked, body.disliked, body.suggestions, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


@app.get("/admin/feedback")
def get_feedback(authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    conn = _get_meta_conn()
    rows = conn.execute("SELECT * FROM session_feedback ORDER BY created_at DESC").fetchall()
    conn.close()
    return {"feedback": [dict(r) for r in rows], "total": len(rows)}


@app.get("/admin/feedback/export")
def export_feedback(authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    conn = _get_meta_conn()
    rows = conn.execute(
        "SELECT session_id, rating, liked, disliked, suggestions, created_at FROM session_feedback ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["session_id", "rating", "liked", "disliked", "suggestions", "created_at"])
    for r in rows:
        writer.writerow([r["session_id"], r["rating"], r["liked"] or "", r["disliked"] or "", r["suggestions"] or "", r["created_at"]])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=alex_feedback.csv"},
    )


# ---------- Admin auth ----------

class LoginRequest(BaseModel):
    password: str


@app.post("/admin/login")
def admin_login(body: LoginRequest):
    expected = os.getenv("ADMIN_PASSWORD", "")
    if not expected or body.password != expected:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = str(uuid.uuid4())
    expires = (datetime.now() + timedelta(hours=8)).isoformat()
    conn = _get_meta_conn()
    conn.execute(
        "INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
        (token, datetime.now().isoformat(), expires),
    )
    conn.commit()
    conn.close()
    return {"token": token, "expires_at": expires}


@app.post("/admin/logout")
def admin_logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        conn = _get_meta_conn()
        conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    return {"status": "logged out"}


# ---------- Health ----------

@app.get("/health")
def health():
    return {"status": "ok"}
