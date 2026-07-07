#!/usr/bin/env bash
# Builds and tags every worker agent image that the backend launches on demand via the
# Python `docker` SDK (marketplace-platform/backend/app/services/docker_launcher.py).
#
# These are NOT part of `docker compose up` — they're not long-running services, they're
# batch containers the backend starts one-per-hired-job. The backend's seed data
# (marketplace-platform/backend/app/seed.py) hardcodes `image_name: "agent-html-ui-builder"`
# for the one worker agent that exists today, so that exact tag must exist locally before
# any hire flow can complete.
#
# Run this once after cloning, and again any time listing-agent/html-ui-builder/ changes:
#   ./scripts/build-agents.sh
# or:
#   make build-agents
#
# --- Why this isn't a plain `docker build -t agent-html-ui-builder listing-agent/html-ui-builder` ---
# The worker's Dockerfile does `COPY agentmarket_sdk ./agentmarket_sdk`, but that SDK
# package lives at the *repo root* (agentmarket_sdk/), not inside listing-agent/html-ui-builder/
# itself — it's shared, immutable, frozen source per PLATFORM_CONTRACT.md. Building with
# the agent's own directory as context fails (agentmarket_sdk not found); building with the
# repo root as context fails the other way (requirements.txt/agent.py etc. aren't at the
# root). So we stage a temporary combined build context containing both, without modifying
# either the agent's own source tree or the root agentmarket_sdk/ package.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$REPO_ROOT/listing-agent/html-ui-builder"
SDK_DIR="$REPO_ROOT/agentmarket_sdk"
IMAGE_TAG="agent-html-ui-builder"

if [[ ! -d "$AGENT_DIR" ]]; then
  echo "error: $AGENT_DIR not found" >&2
  exit 1
fi
if [[ ! -d "$SDK_DIR" ]]; then
  echo "error: $SDK_DIR not found" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d)"
cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

echo "Staging combined build context for $IMAGE_TAG in $STAGE_DIR ..."
cp -R "$AGENT_DIR/." "$STAGE_DIR/"
cp -R "$SDK_DIR" "$STAGE_DIR/agentmarket_sdk"

echo "Building $IMAGE_TAG ..."
docker build -t "$IMAGE_TAG" "$STAGE_DIR"

echo
echo "Built and tagged '$IMAGE_TAG'. Verify with: docker images $IMAGE_TAG"
