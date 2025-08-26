# SDK Upgrader Makefile
# Dynamically get the project root folder name
PROJECT_NAME := $(shell basename $$(dirname $$(pwd)))
# Container name is hardcoded in compose file for now
CONTAINER_NAME := sdk-upgrader-dev
COMPOSE_FILE := ./docker/dev-compose.yml

# Build the Docker image
docker-build:
	docker compose -f $(COMPOSE_FILE) build --build-arg PROJECT_NAME=$(PROJECT_NAME)

# Rebuild the Docker image
docker-rebuild:
	docker compose -f $(COMPOSE_FILE) build --no-cache --build-arg PROJECT_NAME=$(PROJECT_NAME)

# Run the container in detached mode and exec into it
docker-run:
	docker compose -f $(COMPOSE_FILE) up -d
	@echo "Waiting for container $(CONTAINER_NAME) to be ready..."
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if docker exec $(CONTAINER_NAME) true 2>/dev/null; then \
			echo "Container is ready!"; \
			break; \
		fi; \
		timeout=$$((timeout - 1)); \
		sleep 1; \
	done; \
	if [ $$timeout -eq 0 ]; then \
		echo "Error: Container failed to become ready in 30 seconds"; \
		docker logs $(CONTAINER_NAME); \
		exit 1; \
	fi
	docker exec -ti $(CONTAINER_NAME) /bin/bash

# Additional useful targets
docker-stop:
	docker compose -f $(COMPOSE_FILE) stop

docker-down:
	docker compose -f $(COMPOSE_FILE) down

docker-logs:
	docker compose -f $(COMPOSE_FILE) logs -f

docker-restart: docker-down docker-run

# Install agents to project's .claude/agents/ directory
install-agents:
	./scripts/install_agents.sh

# Run SDK upgrade
# Usage: make run-upgrade OLD_TAG=polkadot-stable2407 NEW_TAG=polkadot-stable2410
run-upgrade:
	@if [ -z "$(OLD_TAG)" ] || [ -z "$(NEW_TAG)" ]; then \
		echo "Usage: make run-upgrade OLD_TAG=<old-tag> NEW_TAG=<new-tag>"; \
		echo "Example: make run-upgrade OLD_TAG=polkadot-stable2407 NEW_TAG=polkadot-stable2410"; \
		exit 1; \
	fi
	./scripts/runner.sh $(OLD_TAG) $(NEW_TAG)

.PHONY: docker-build docker-run docker-stop docker-down docker-logs docker-rebuild docker-restart install-agents run-upgrade