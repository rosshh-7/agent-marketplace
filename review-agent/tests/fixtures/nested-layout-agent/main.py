"""Entrypoint at the root, but the actual graph/nodes live under agent/ — a normal Python
package layout, not the flat agent.py/prompts.py convention. Proves review-agent's intake
discovers the entrypoint via the Dockerfile's CMD and the SDK-contract check looks across
the whole submission, not just this file.
"""
from agentmarket_sdk import sdk
from agent.graph import build_graph

if __name__ == "__main__":
    task = sdk.task_input()
    sdk.log(f"Starting task: {task.get('deliverable', 'unknown')}")
    app = build_graph()
    app.invoke({"task": task, "drafts": [], "current_draft": 0})
