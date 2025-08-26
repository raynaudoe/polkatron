# SDK Upgrader Docker Environment

This directory contains Docker configuration for running the SDK upgrader in a containerized environment.

## Prerequisites

- Docker and Docker Compose installed
- GitHub account with access to the repository
- Anthropic API credentials

## Setup

1. Copy the example environment file and add your credentials:
   ```bash
   cp docker/env.example docker/.env
   # Edit docker/.env with your actual credentials
   ```

2. Build and run the container:
   ```bash
   make docker-build
   make docker-run
   ```
   This will build the image, start the container, and automatically exec into it.

3. Configure GitHub CLI inside the container:
   ```bash
   gh auth login
   ```

4. Navigate to the SDK upgrader and run:
   ```bash
   cd sdk-upgrader
   ./scripts/runner.sh polkadot-stable2407 polkadot-stable2410
   ```

## Docker Management Commands

All Docker operations can be managed through the Makefile from the `sdk-upgrader` directory:

### Building
- `make docker-build` - Build the Docker image with caching
- `make docker-rebuild` - Rebuild the image from scratch (no cache)

### Running
- `make docker-run` - Start container and automatically exec into it
- `make docker-stop` - Stop the running container
- `make docker-down` - Stop and remove the container
- `make docker-restart` - Restart the container (down + run)

### Debugging
- `make docker-logs` - Follow container logs in real-time
- `docker compose -f docker/dev-compose.yml exec dev /bin/bash` - Manually enter a running container

## What's Included

The Docker image includes all necessary dependencies:
- Rust toolchain (1.83)
- Cargo and related tools (cargo-nextest, cargo-audit, etc.)
- Python 3 for error parsing scripts
- GitHub CLI for fetching PR data
- Claude CLI for AI-powered upgrades
- Node.js 20 LTS
- All system dependencies (git, jq, curl, etc.)
- **Serena MCP server** for semantic code understanding
- **rust-docs-mcp** for Rust documentation access

## Serena Integration

The Docker image includes Serena, a semantic code understanding tool that enhances the SDK upgrader's capabilities:

- **Automatic MCP Setup**: Serena is pre-configured as an MCP server for Claude Code
- **Symbol Resolution**: Helps AI agents understand undefined traits, methods, and types
- **Code Navigation**: Provides semantic understanding of Rust code structure
- **Error Context**: Enhances error resolution with better code understanding

To use Serena within the container:
```bash
# Serena is automatically available to Claude Code via MCP
# The AI agents can leverage it for better code understanding
claude code "Find the definition of trait XYZ"
```

**Note**: The container automatically registers Serena as an MCP server with Claude CLI using `claude mcp add`. This configuration is stored in the user's Claude settings, not in a `.mcp.json` file.

## Volume Mounts

- The entire project repository is mounted at `/workspace`
- Cargo cache is persisted in a named volume
- Target directory is persisted to speed up builds