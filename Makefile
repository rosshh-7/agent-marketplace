.PHONY: build-agents up down logs ps dev-frontend prod-frontend

# Build + tag the worker agent image(s) launched on demand by the backend (not part of
# `docker compose up` — see scripts/build-agents.sh for why).
build-agents:
	./scripts/build-agents.sh

# Full bring-up: worker image first, then the rest of the stack.
up: build-agents
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

# Frontend hot-reload mode: webpack-dev-server runs inside the container with
# ./marketplace-platform/frontend/src bind-mounted, so UI edits rebuild and
# refresh the browser on save (see docker-compose.dev.yml). Same port 3001.
dev-frontend:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build frontend

# Back to the production nginx build, with the latest source baked in.
prod-frontend:
	docker compose up -d --build frontend
