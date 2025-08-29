# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automated Polkadot SDK upgrade tool using AI agents to handle breaking changes. The system uses a stateless FSM architecture with an MCP server that bundles all prompts internally, preventing context pollution through clean state machine evaluation.

## Essential Commands

### MCP Server Operations
```bash
# Build and test MCP server
cd mcp-server
npm run build           # Build the MCP server
npm test               # Run tests
npm run dev            # Development mode with watch

# Register MCP server with Claude
claude mcp add --scope user sdk-upgrader stdio://$(pwd)/dist/index.js
claude mcp list        # Verify installation
```

### Running SDK Upgrades
```bash
# Via MCP (recommended)
# First: "Use initialize to set up required files"
# Then: "Use sdk_upgrade with oldTag='polkadot-stable2407' and newTag='polkadot-stable2410'"

# Via Make targets (legacy)
make run-upgrade OLD_TAG=polkadot-stable2407 NEW_TAG=polkadot-stable2410
make install-agents    # Install agents to .claude/agents/
```

### Development & Testing
```bash
# Check compilation errors
./scripts/check_build.sh              # Outputs JSON to /tmp/cargo_messages_*.json
./scripts/check_test_build.sh         # Check test compilation

# Run specific Rust tests
cargo test --package <module> <test_name> -- --exact --nocapture

# Scout PR artifacts manually
./scripts/scout.sh polkadot-stable2410
```

### Docker Development
```bash
make docker-build      # Build container
make docker-run        # Run and exec into container
make docker-logs       # View logs
make docker-restart    # Full restart
```

## Architecture

### Three-Layer Execution Model
```
MCP Server (sdk_upgrade)
    ↓
SDK Upgrade Orchestrator (Main Agent)
    ↓ (spawns in loop)
FSM Evaluator (Stateless Subagent)
```

**Key Design**: The FSM evaluator starts fresh each invocation, preventing context pollution. It reads `status.json`, evaluates the current state, outputs `pending_steps`, then exits. The orchestrator executes these steps and repeats.

### State Machine Flow
```
INIT → CHECK_SCOUT → UPDATE_DEPS → CHECK_ERRORS → EXECUTE → SPAWN → UPDATE
         ↓                                ↓
    (scout.sh)                   TEST_WORKSPACE → CHECK_TESTS → EXECUTE_TEST_FIX
                                         ↓
                                    COMPLETE or ERROR_REPORT
```

### Agent Architecture

**Bundled in MCP Server** (`mcp-server/src/`):
- `orchestratorPrompt.ts`: Main orchestrator that executes steps
- `fsmEvaluatorPrompt.ts`: Stateless FSM evaluator 
- `initializeTool.ts`: Deploys all agents including fsm-evaluator

**Deployed Agents** (`.claude/agents/`):
- `polkadot-bug-fixer`: Fixes compilation errors by symbol groups
- `polkadot-tests-fixer`: Fixes test failures by module
- `fsm-evaluator`: Pure state machine evaluator

### Error Grouping Strategy
```python
# scripts/error_grouper.py
- Primary: Group by Rust error code (E0308, E0502)
- Secondary: Extract symbols from error messages
- Max 10 errors per group (configurable)
- Sorts by frequency for efficiency
```

### Knowledge Persistence

**Error Recovery Handbook** (`resources/error_recovery_handbook.md`):
```markdown
### SYMBOL: error_type
- **Error**: Description
- **Fix**: Solution applied
- **Confidence**: 0.0-1.0
- **Context**: Additional info
```

**Status Tracking** (`output/status.json`):
```json
{
  "current_state": "CHECK_ERRORS",
  "pending_steps": [],
  "execution_context": {
    "variables": {},
    "last_error": null
  },
  "error_groups": [],
  "iteration": 0
}
```

## Critical Implementation Details

### MCP Server Integration
- All prompts bundled in TypeScript files (no external YAML/MD reading)
- `orchestratorTool.ts` returns bundled prompt for main context execution
- `initializeTool.ts` creates all required agents and directories

### Circuit Breaker Pattern
- Detects repeated errors after 5 identical iterations
- Exit code 99 for graceful shutdown
- Prevents infinite fix loops

### Agent Tool Requirements
- **Serena MCP**: Must switch to "editing" mode first
- **rust-docs MCP**: For Polkadot SDK API lookups
- Both tools are mandatory for every fix attempt

## Modifying the System

### Update FSM Logic
1. Edit `mcp-server/src/fsmEvaluatorPrompt.ts` (bundled version)
2. Edit `agents/fsm-evaluator.md` (local version)
3. Rebuild: `cd mcp-server && npm run build`
4. Reinstall agents: `make install-agents`

### Add New Error Patterns
Edit `scripts/error_grouper.py`:
- Modify `extract_symbols()` for better symbol detection
- Adjust `group_errors()` for new grouping strategies
- Update regex patterns in `parse_cargo_json()`

### Enhance Agent Capabilities
1. Update bundled versions in `mcp-server/src/`
2. Update local versions in `agents/`
3. Rebuild MCP server
4. Test with small error samples first

## Output Artifacts

Generated in `output/`:
- `status.json`: Current FSM state and pending steps
- `UPGRADE_REPORT_*.md`: All fixes with confidence scores
- `test_report_*.md`: Test fix attempts
- `error_summary_*.md`: Unfixed compilation errors
- `test_error_summary_*.md`: Unfixed test failures

## Environment Variables

```bash
PROJECT_ROOT        # Repository root
STATUS_FILE         # output/status.json
MAX_ITERATIONS      # Default: 40
SDK_BRANCH          # Branch without "polkadot-" prefix
SCOUT_DIR           # resources/scout/polkadot-sdk-${NEW_TAG}
ERROR_GROUPER_PATH  # scripts/error_grouper.py
```

## Common Issues & Solutions

**MCP Tool Not Found**:
```bash
claude mcp remove sdk-upgrader
claude mcp add --scope user sdk-upgrader stdio://$(pwd)/mcp-server/dist/index.js
```

**Scout Artifacts Missing**:
- FSM now includes CHECK_SCOUT state
- Automatically runs `scripts/scout.sh` if needed
- Manual: `./scripts/scout.sh polkadot-stable2410`

**Cargo Check Loops**:
- Circuit breaker triggers after 5 iterations
- Check `output/status.json` for repeated error groups
- Manual fix: `cargo update -p base64ct --precise 1.7.3`

**Agent Not Found Errors**:
- Run `make install-agents` to deploy all agents
- Verify `.claude/agents/` contains all three agents
- Check agent names match exactly (no "error-fixer")

## Performance Expectations

- Typical upgrade: < 20 iterations
- Confidence scores: > 0.8 for most fixes
- Scout download: ~2-5 minutes depending on release size
- Build check: ~30-60 seconds per iteration
- Test phase: Similar iteration count as build phase

**CLAUDE.MD UPDATED 🚀**