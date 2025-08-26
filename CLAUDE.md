# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The SDK Upgrader is an automated tool that upgrades Polkadot SDK dependencies using AI agents to handle breaking changes. It employs a Finite State Machine (FSM) orchestrator with specialized agents for fixing compilation errors and test failures.

## Essential Commands

### Running Upgrades
```bash
# Full upgrade process
make run-upgrade OLD_TAG=polkadot-stable2407 NEW_TAG=polkadot-stable2410

# Individual phases
./scripts/scout.sh polkadot-stable2410              # Download PR artifacts
./scripts/runner.sh polkadot-stable2407 polkadot-stable2410  # Execute upgrade

# Install agents for Claude Code
make install-agents
```

### Docker Development
```bash
make docker-build    # Build container
make docker-rebuild  # Rebuild without cache
make docker-run      # Run upgrade in container
make docker-logs     # View logs
make docker-stop     # Stop container
make docker-down     # Stop and remove container
make docker-restart  # Restart container
```

### Testing & Validation
```bash
# Check compilation errors (outputs JSON to /tmp/cargo_messages_*.json)
./scripts/check_build.sh

# Check test compilation (outputs JSON to /tmp/cargo_test_messages_*.json)
./scripts/check_test_build.sh

# Run cargo check with JSON output
cargo check --all-targets --message-format=json

# Run single test
cargo test --package <module> <test_name> -- --exact --nocapture
```

## Architecture

### Core Flow
1. **Scout Phase** (`scripts/scout.sh`): Downloads PR artifacts to `resources/scout/polkadot-sdk-<NEW_TAG>/`
   - Fetches release notes and PR descriptions/diffs
   - Stores in `pr-<number>/description.md` and `pr-<number>/patch.diff`
2. **FSM Orchestrator** (`scripts/runner.sh`): Executes state machine from `prompts/orchestrator.yaml`
   - Max iterations: 40 (configurable via MAX_ITERATIONS)
   - Tracks progress in `output/status.json`
3. **Error Grouping** (`scripts/error_grouper.py`): Groups errors dynamically by error code (E0308, E0502, etc.)
   - Primary grouping: error code
   - Secondary context: symbol extraction from error messages
   - Max errors per group: 10 (configurable)
4. **AI Agents**: Fix errors based on grouped symbols
   - `@polkadot-bug-fixer`: Compilation errors (uses Serena MCP + rust-docs)
   - `@polkadot-tests-fixer`: Test failures (module-based grouping)

### State Machine Flow
```
INIT → UPDATE_DEPS → CHECK_ERRORS → EXECUTE → SPAWN → UPDATE → CHECK_ERRORS (loop)
                           ↓                                         ↓
                    TEST_WORKSPACE → CHECK_TESTS → EXECUTE_TEST_FIX → SPAWN_TEST_FIXER
                           ↓
                      COMPLETE or ERROR_REPORT/TEST_ERROR_REPORT (on max iterations)
```

### Key Design Patterns

#### Collaborative Learning
Agents share knowledge through `resources/error_recovery_handbook.md`:
- Each successful fix is appended with symbol indexing
- Format: `### SYMBOL: error_type` followed by solution
- Agents check handbook before attempting new fixes

#### Error Grouping Strategy
- Primary grouping by Rust error code (E0308, E0502, etc.) for better accuracy
- Secondary grouping by symbol within each error code for context
- Max 10 errors per group (configurable via `max_per_group`)
- Sorts groups by frequency (most common errors first)
- Handles both JSON (cargo check) and text (cargo test) output

#### Circuit Breaker Pattern
- Prevents infinite loops by detecting repeated errors
- Triggers after 5 identical error iterations
- Agent exits with code 99 for graceful shutdown

#### Agent MCP Tool Integration
- **Serena MCP**: Semantic code analysis and editing (must switch to "editing" mode)
- **rust-docs MCP**: Documentation lookups for Polkadot SDK APIs
- Agents MUST use these tools for every fix (not optional)

### Agent Input Flexibility
Agents accept both natural language and structured JSON:
```bash
# Natural language
"fix the xcm crate errors"

# Structured JSON
{"file": "pallets/xcm/src/lib.rs", "line": 42, "error_code": "E0308"}
```

## Troubleshooting Upgrade Failures

### Check Current State
```bash
cat output/status.json  # View FSM state and error groups
```

### Debug Build Failures
1. Review error groups in `output/status.json`
2. Check `resources/error_recovery_handbook.md` for existing solutions
3. Examine `output/UPGRADE_REPORT_*.md` for applied fixes
4. Verify error grouping logic in `scripts/error_grouper.py`

### Debug Test Failures
1. Check test groups in `output/status.json`
2. Review `output/test_report_*.md` for test fix attempts
3. Examine agent logs in stderr output

### Common Issues
- **Cargo check loops**: Circuit breaker prevents infinite loops (exit code 99)
- **base64ct conflicts**: MUST run `cargo update -p base64ct --precise 1.7.3` (see handbook mandatory fixes)
- **Trait reorganization**: Scout artifacts contain migration mappings in `pr-*/patch.diff`
- **Import errors**: Check `common_migrations.yaml` for trait migrations (Currency→Fungible, etc.)
- **Version conflicts**: Run `cargo tree -i <crate_name>` to identify dependency issues

## Modifying the System

### Update FSM Workflow
Edit `prompts/orchestrator.yaml`:
- Modify state transitions
- Adjust iteration limits (default: 40)
- Change error thresholds

### Enhance Agent Capabilities
Edit agent specifications in `agents/`:
- Add new error patterns
- Improve fix strategies
- Update confidence scoring logic

### Improve Error Grouping
Modify `scripts/error_grouper.py`:
- Refine symbol extraction patterns
- Add special case handling
- Improve Rust version detection

## Output Artifacts

Generated in `output/` directory:
- `status.json`: Real-time FSM state and progress
- `UPGRADE_REPORT_*.md`: All fixes applied with confidence scores
- `test_report_*.md`: Test fixing details
- `error_summary_*.md`: Unfixed compilation errors (if any remain)
- `test_error_summary_*.md`: Unfixed test failures (if any remain)

## Key Files & Directories

### Configuration Files
- `prompts/orchestrator.yaml`: FSM state machine definition
- `resources/common_migrations.yaml`: Common SDK migration patterns
- `resources/error_recovery_handbook.md`: Proven fixes database (SYMBOL-indexed)
- `docker/dev-compose.yml`: Docker setup with Serena MCP integration

### Critical Environment Variables
```bash
PROJECT_ROOT       # Git repository root
STATUS_FILE        # output/status.json
UPGRADE_REPORT_PATH # output/UPGRADE_REPORT_${NEW_TAG}.md
TEST_REPORT_PATH   # output/test_report_${NEW_TAG}.md
MAX_ITERATIONS     # Default: 40
SDK_BRANCH         # Branch name without "polkadot-" prefix
```

## Performance Targets

- Iterations: < 20 for typical upgrades
- Confidence scores: > 0.8 for majority of fixes
- Success rate: 100% autonomous completion
- No circuit breaker triggers

## Continuous Improvement

Update this file when:
- FSM states or transitions change
- New agent capabilities are added
- Error grouping strategies evolve
- Performance patterns emerge
- Circuit breaker thresholds need adjustment

Mark updates with: **CLAUDE.MD UPDATED 🚀**