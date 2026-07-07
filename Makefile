.PHONY: build-agents up down logs ps

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
