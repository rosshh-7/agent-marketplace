# Requirements Gathering Agent

A conversational AI agent that gathers project requirements through natural dialogue or a structured form, then generates a requirements document (JSON + Markdown).

Built with **LangGraph** + **FastAPI** + **Groq (LLaMA 3.3 70B)**.

---

## Features

- **Two modes** — Conversation (natural dialogue) or Form (numbered fields, one at a time)
- **Four topics** — General, Mobile App, Web Application, API/Backend
- **Persistent sessions** — conversations saved to SQLite, survive server restarts
- **Three output files** per session — structured JSON, Markdown document, full transcript
- **`new` command** — start a fresh session without leaving the terminal

---

## Setup

### Step 1 — Get a Groq API Key

1. Go to [console.groq.com](https://console.groq.com) and sign up for a free account
2. Navigate to **API Keys** in the left sidebar
3. Click **Create API Key**, give it a name, and copy the key (starts with `gsk_`)

### Step 2 — Check Python Version

You need Python 3.10 or higher.

```bash
python3 --version
```

If you don't have it, download from [python.org](https://www.python.org/downloads/).

### Step 3 — Extract the Project

```bash
tar -xzf req_agent.tar.gz
cd req_agent
```

### Step 4 — Create a Virtual Environment

```bash
python3 -m venv .venv
```

Activate it:

```bash
# Mac / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

You should see `(.venv)` at the start of your terminal prompt.

### Step 5 — Install Dependencies

```bash
pip install -r requirements.txt
```

This installs LangGraph, FastAPI, the Groq client, and all other dependencies.

### Step 6 — Add Your API Key

```bash
cp .env.example .env
```

Open the `.env` file in any text editor and replace the placeholder with your key:

```
GROQ_API_KEY=gsk_your_key_here
```

---

## Running

### Option A — Docker (recommended)

No Python installation needed. Just Docker.

**1. Make sure Docker is installed** → [docs.docker.com/get-docker](https://docs.docker.com/get-docker/)

**2. Add your API key to `.env`** (same as Step 6 above)

**3. Build and start the API server:**

```bash
docker-compose up -d api
```

**4. Launch the CLI in a new terminal:**

```bash
docker-compose run --rm cli
```

The CLI connects to the API automatically. Output files appear in your local `output/` folder.

**To stop the server:**

```bash
docker-compose down
```

---

### Option B — Local Python

You need **two terminal windows** open at the same time, both inside the `req_agent` folder with the virtual environment activated (`source .venv/bin/activate`).

**Terminal 1 — Start the API server:**

```bash
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8002
INFO:     Application startup complete.
```

Leave this running. **Do not close it.**

**Terminal 2 — Start the CLI:**

```bash
python -m cli.client
```

The agent will greet you and you can start your session.

---

## Usage

1. Select a **topic** and **mode** when prompted
2. Answer the agent's questions
3. Type `finalize` to generate your requirements document
4. Type `new` to start a fresh session without restarting
5. Press `Ctrl+C` to exit

Output files are saved to the `output/` folder:

```
output/
├── project_name_timestamp.json            ← structured requirements
├── project_name_timestamp.md              ← requirements document
└── project_name_timestamp_transcript.md   ← full conversation
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Start a new session |
| `POST` | `/sessions/{id}/chat` | Send a message |
| `POST` | `/sessions/{id}/finalize` | Generate output files |
| `GET`  | `/sessions/{id}/requirements` | Get current requirements |
| `GET`  | `/health` | Health check |

### Example

```bash
# Start a session
curl -X POST http://localhost:8002/sessions \
  -H "Content-Type: application/json" \
  -d '{"topic": "mobile_app", "mode": "form"}'

# Chat
curl -X POST http://localhost:8002/sessions/{session_id}/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Water intake tracker for iOS and Android"}'

# Finalize
curl -X POST http://localhost:8002/sessions/{session_id}/finalize
```

---

## Project Structure

```
req_agent/
├── agent/
│   ├── state.py       # LangGraph state definition
│   ├── nodes.py       # gather_node, extract_node
│   ├── graph.py       # StateGraph wiring + SQLite checkpointer
│   └── prompts.py     # System prompts for each mode/topic
├── api/
│   └── server.py      # FastAPI server
├── cli/
│   └── client.py      # Interactive terminal client
├── output/            # Generated documents (created on first run)
├── data/              # SQLite session database (created on first run)
├── main.py            # Server entry point
└── requirements.txt
```

---

## Topics & Modes

**Topics** shape the questions the agent asks:

| Topic | Key areas covered |
|-------|------------------|
| `general` | Overview, goals, features, constraints |
| `mobile_app` | + Platform (iOS/Android), offline, push notifications |
| `web_app` | + Browser support, auth, hosting, SEO |
| `api` | + API style, auth mechanism, rate limiting, SLA |

**Modes** control the conversation style:

| Mode | Behaviour |
|------|-----------|
| `conversation` | Natural dialogue — agent asks questions freely |
| `form` | Structured — numbered fields collected one at a time |
