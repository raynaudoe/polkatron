#!/bin/bash
# Initialize MCP configuration for Claude Code with Serena and Rust Docs


init_serena_mcp() {
  # Check if Serena service is available
  if [ -n "$SERENA_MCP_URL" ]; then
    echo "Configuring Serena MCP to use service at $SERENA_MCP_URL..."
    
    # Wait for Serena service to be ready with health check
    echo "Waiting for Serena service to start..."
    for i in {1..60}; do
      if curl -s "${SERENA_MCP_URL}/health" > /dev/null 2>&1; then
        echo "✓ Serena service is healthy and ready"
        break
      elif [ $i -eq 60 ]; then
        echo "⚠️  Serena service failed to start after 60 seconds"
        echo "  Check docker logs: docker logs serena-mcp"
        return 1
      fi
      echo -n "."
      sleep 1
    done
    echo ""
    
    # Test Serena connectivity
    if curl -s "${SERENA_MCP_URL}/sse" -H "Accept: text/event-stream" --max-time 2 > /dev/null 2>&1; then
      echo "✓ Serena SSE endpoint is accessible"
    else
      echo "⚠️  Serena SSE endpoint not responding correctly"
      echo "  URL: ${SERENA_MCP_URL}/sse"
    fi
    
    # Register Serena MCP server with Claude CLI using SSE transport
    if ! claude mcp list 2>/dev/null | grep -q "serena:"; then
      echo "Registering Serena MCP server with SSE transport..."
      claude mcp add --scope user --transport sse serena "${SERENA_MCP_URL}/sse"
      echo "✓ Serena MCP server registered with Claude Code (SSE transport)"
      echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "  🚀 Serena Features Available:"
      echo "     • Semantic code navigation with rust-analyzer"
      echo "     • Symbol-aware editing and refactoring"
      echo "     • Project-wide code understanding"
      echo "     • Intelligent code completion"
      echo "  📊 Dashboard: http://localhost:24282"
      echo "  📡 MCP Server: ${SERENA_MCP_URL}/sse"
      echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    else
      echo "✓ Serena MCP server already registered"
      # Update registration if URL changed
      current_url=$(claude mcp list 2>/dev/null | grep "serena:" | awk '{print $2}')
      if [ "$current_url" != "${SERENA_MCP_URL}/sse" ]; then
        echo "  Updating Serena URL from $current_url to ${SERENA_MCP_URL}/sse"
        claude mcp remove serena 2>/dev/null || true
        claude mcp add --scope user --transport sse serena "${SERENA_MCP_URL}/sse"
      fi
    fi
    
    # Initialize project if not already done
    if [ ! -f "/workspace/.serena/project.yml" ]; then
      echo "Initializing Serena project configuration..."
      cd /workspace && uvx --from git+https://github.com/oraios/serena serena project generate-yml --language rust
      echo "✓ Serena project initialized for Rust"
    fi
  else
    echo "⚠️  SERENA_MCP_URL not set, skipping Serena MCP registration"
    echo "  To use Serena, ensure the serena service is running in docker-compose"
  fi
}

init_rust_docs_mcp() {
  WRAPPER_PATH="$HOME/.local/bin/rust-docs-mcp-wrapper.sh"
  mkdir -p "$HOME/.local/bin"

  if [ ! -f "$WRAPPER_PATH" ]; then
    echo "Creating Rust Docs MCP wrapper script..."
    cat > "$WRAPPER_PATH" << 'EOF'
#!/bin/bash
exec rust-docs-mcp "$@"
EOF
    chmod +x "$WRAPPER_PATH"
    echo "✓ Rust Docs wrapper script created at $WRAPPER_PATH"
  fi

  # Register Rust Docs MCP server with Claude CLI
  if ! claude mcp list 2>/dev/null | grep -q "rust-docs:"; then
    echo "Registering Rust Docs MCP server..."
    claude mcp add --scope user --transport stdio rust-docs "$WRAPPER_PATH"
    echo "✓ Rust Docs MCP server registered with Claude Code"
  else
    echo "✓ Rust Docs MCP server already registered"
  fi

  # Note: Rust Docs MCP server will be started by Claude Code via stdio when needed
  echo "✓ Rust Docs MCP server configured for stdio communication"
}

# Always run initialization
init_serena_mcp
init_rust_docs_mcp

# If no arguments provided, start bash
if [ $# -eq 0 ]; then
  exec /bin/bash
else
  # Execute the provided command
  exec "$@"
fi 