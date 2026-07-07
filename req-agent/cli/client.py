"""CLI client for the Requirements Gathering Agent.

Usage:
    python -m cli.client [--api-url http://localhost:8002]
"""

import sys
import argparse
import httpx

DEFAULT_API_URL = "http://localhost:8002"

TOPICS = {
    "1": ("general",    "General"),
    "2": ("mobile_app", "Mobile App"),
    "3": ("web_app",    "Web Application"),
    "4": ("api",        "API / Backend"),
}

MODES = {
    "1": ("conversation", "Conversation  — natural dialogue, agent asks questions freely"),
    "2": ("form",         "Form          — structured fields, one at a time"),
}


def _pick(prompt: str, options: dict) -> str:
    print(prompt)
    for key, value in options.items():
        label = value[1]
        print(f"  {key}. {label}")
    while True:
        choice = input("\nEnter choice: ").strip()
        if choice in options:
            return options[choice][0]
        print(f"  Please enter one of: {', '.join(options.keys())}")


def _print_agent(message: str) -> None:
    print(f"\nAgent: {message}\n")


def _start_session(client: httpx.Client, topic: str, mode: str) -> str:
    """Create a new session and print the opening message. Returns session_id."""
    resp = client.post("/sessions", json={"topic": topic, "mode": mode})
    resp.raise_for_status()
    data = resp.json()
    print(f"\nNew session started  [topic: {data['topic']}]  [mode: {data['mode']}]")
    print("Commands: 'finalize' — generate document  |  'new' — start over")
    print("-" * 52)
    _print_agent(data["message"])
    return data["session_id"]


def run(api_url: str) -> None:
    client = httpx.Client(base_url=api_url, timeout=60.0)

    print("\n" + "=" * 52)
    print("   Requirements Gathering Agent")
    print("=" * 52)

    try:
        client.get("/health").raise_for_status()
    except httpx.ConnectError:
        print(f"\n[ERROR] Cannot connect to API at {api_url}")
        print("  Start the server first: python main.py")
        sys.exit(1)

    topic = _pick("\nSelect a topic:", TOPICS)
    mode  = _pick("\nSelect a mode:", MODES)
    session_id = _start_session(client, topic, mode)

    while True:
        try:
            user_input = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nSession ended. Requirements not finalized.")
            break

        if not user_input:
            continue

        if user_input.lower() == "new":
            topic = _pick("\nSelect a topic:", TOPICS)
            mode  = _pick("\nSelect a mode:", MODES)
            session_id = _start_session(client, topic, mode)
            continue

        if user_input.lower() in ("finalize", "done", "finish"):
            print("\nGenerating requirements document...")
            try:
                resp = client.post(f"/sessions/{session_id}/finalize")
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                print(f"[ERROR] {e.response.json().get('detail', str(e))}")
                continue

            data = resp.json()
            print("\nRequirements document generated!")
            print(f"  JSON:       {data['json_path']}")
            print(f"  Markdown:   {data['markdown_path']}")
            print(f"  Transcript: {data['transcript_path']}")
            print("\nType 'new' to start another session or Ctrl+C to exit.\n")
            continue

        try:
            resp = client.post(f"/sessions/{session_id}/chat", json={"message": user_input})
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            print(f"[ERROR] {e.response.json().get('detail', str(e))}")
            continue

        _print_agent(resp.json()["message"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Requirements Gathering Agent CLI")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Base URL of the API server")
    args = parser.parse_args()
    run(args.api_url)


if __name__ == "__main__":
    main()
