#!/usr/bin/env bash
# Pull latest code and redeploy with zero-ish downtime.
# Run from the project root: bash deploy/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "[update] Pulling latest code..."
git pull

echo "[update] Rebuilding worker image..."
bash scripts/build-agents.sh

echo "[update] Rebuilding and restarting services..."
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build

echo "[update] Done. Running containers:"
docker compose ps
