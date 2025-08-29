# 🚀 Polkatron SDK Upgrader

**Self-contained AI-powered Polkadot SDK upgrade automation** that intelligently handles breaking changes, migration patterns, and iterative error resolution through specialized agents and finite state machine orchestration.

## ✨ Key Innovations

### 🧠 Nested Subagent Problem Solver
- **Revolutionary MCP Architecture**: Solves Claude's nested subagent limitation through bundled prompt execution
- **Main Context Execution**: Orchestrator runs in Claude's primary context, enabling full subagent spawning capabilities
- **Zero External Dependencies**: Self-contained with all prompts, agents, and scripts bundled

### 🤖 Intelligent Agent Collaboration
- **Specialized Agents**: Domain-specific agents for compilation errors, test failures, and state evaluation
- **Knowledge Transfer**: Shared error recovery handbook grows with each successful fix
- **Confidence Scoring**: Each fix includes confidence metrics and validation

### 🎯 FSM-Driven Orchestration
- **State Machine Control**: Deterministic workflow management with clear state transitions
- **Error-Based Sequential Processing**: Intelligent error grouping and iterative resolution
- **Progress Tracking**: Real-time status updates and comprehensive reporting

## 📊 System Architecture

```mermaid
graph TB
    subgraph "🎯 User Interface"
        CLI[Claude Code CLI<br/>with MCP Server]
        TOOLS[MCP Tools<br/>initialize & sdk_upgrade]
    end

    subgraph "🚀 MCP Server Layer"
        MCP[MCP Server<br/>@polkatron/sdk-upgrader-mcp]
        INIT[Initialize Tool<br/>Project Setup]
        UPGRADE[SDK Upgrade Tool<br/>Prompt Expander]
        BUNDLED[Bundled Assets<br/>Prompts + Agents + Scripts]
    end

    subgraph "🧠 Claude Main Context"
        ORCH[SDK Upgrade Orchestrator<br/>FSM Executor]
        EVAL[FSM Evaluator Agent<br/>State Decisions]
    end

    subgraph "🔧 Specialized Agents"
        BUG_FIXER[Polkadot Bug Fixer<br/>Compilation Errors]
        TEST_FIXER[Polkadot Tests Fixer<br/>Test Failures]
    end

    subgraph "📚 Knowledge Base"
        HANDBOOK[Error Recovery Handbook<br/>Growing Knowledge]
        SCOUT[Scout Artifacts<br/>PR Data & Migrations]
        REPORTS[Generated Reports<br/>Progress & Results]
    end

    subgraph "🏗️ Project Infrastructure"
        CARGO[Cargo.toml<br/>Dependencies]
        SCRIPTS[Build Scripts<br/>check_build.sh, error_grouper.py]
        STATUS[Status Tracking<br/>status.json FSM State]
    end

    CLI --> TOOLS
    TOOLS --> MCP
    MCP --> INIT
    MCP --> UPGRADE
    INIT --> BUNDLED
    UPGRADE --> BUNDLED

    BUNDLED --> ORCH
    ORCH --> EVAL
    EVAL --> BUG_FIXER
    EVAL --> TEST_FIXER

    BUG_FIXER --> HANDBOOK
    TEST_FIXER --> HANDBOOK
    HANDBOOK --> BUG_FIXER
    HANDBOOK --> TEST_FIXER

    ORCH --> CARGO
    ORCH --> SCRIPTS
    ORCH --> STATUS

    BUG_FIXER --> CARGO
    TEST_FIXER --> CARGO

    SCOUT --> BUG_FIXER
    SCOUT --> TEST_FIXER

    ORCH --> REPORTS
    BUG_FIXER --> REPORTS
    TEST_FIXER --> REPORTS

    style CLI fill:#e1f5fe
    style MCP fill:#f3e5f5
    style ORCH fill:#fff3e0
    style BUG_FIXER fill:#e8f5e8
    style TEST_FIXER fill:#e8f5e8
    style HANDBOOK fill:#fff8e1
```

## 🔄 Complete Upgrade Workflow

```mermaid
stateDiagram-v2
    [*] --> INIT
    INIT --> CHECK_SCOUT: No status.json
    INIT --> CHECK_ERRORS: Status exists

    CHECK_SCOUT --> UPDATE_DEPS: Scout complete
    UPDATE_DEPS --> CHECK_ERRORS: Dependencies updated

    CHECK_ERRORS --> EXECUTE: Errors found
    CHECK_ERRORS --> TEST_WORKSPACE: No errors
    CHECK_ERRORS --> ERROR_REPORT: Max iterations

    EXECUTE --> SPAWN: Has pending group
    EXECUTE --> UPDATE: All groups complete

    SPAWN --> UPDATE: Agent completes
    UPDATE --> CHECK_ERRORS: Build verification

    TEST_WORKSPACE --> CHECK_TESTS: Test phase initialized

    CHECK_TESTS --> EXECUTE_TEST_FIX: Failures found
    CHECK_TESTS --> COMPLETE: No failures
    CHECK_TESTS --> TEST_ERROR_REPORT: Max iterations

    EXECUTE_TEST_FIX --> SPAWN_TEST_FIXER: Has test group
    EXECUTE_TEST_FIX --> CHECK_TESTS: All tests complete

    SPAWN_TEST_FIXER --> UPDATE_TEST_STATUS: Test agent completes
    UPDATE_TEST_STATUS --> EXECUTE_TEST_FIX: Status updated

    TEST_ERROR_REPORT --> ERROR_REPORT: Test errors summarized
    ERROR_REPORT --> [*]: Error report complete
    COMPLETE --> [*]: Upgrade successful

    note right of INIT
        Initialize upgrade process
        Check existing status
    end note

    note right of CHECK_SCOUT
        Download PR artifacts
        Analyze release notes
        Extract migration patterns
    end note

    note right of UPDATE_DEPS
        Update Cargo.toml
        Set SDK branch
        Create initial status
    end note

    note right of EXECUTE
        Process error groups
        sequentially with
        mandatory verification
    end note

    note right of TEST_WORKSPACE
        Start test-fixing phase
        Reset test counters
        Initialize test tracking
    end note
```

## 🎯 Agent Specialization Matrix

| Agent | Purpose | Input | Output | Knowledge Source |
|-------|---------|-------|--------|------------------|
| **FSM Evaluator** | State Machine Logic | `status.json` | `pending_steps[]` | Embedded FSM rules |
| **Polkadot Bug Fixer** | Compilation Errors | Error groups | Fixed code + handbook | Scout PRs + handbook |
| **Polkadot Tests Fixer** | Test Failures | Test groups | Fixed tests + handbook | Scout PRs + handbook |
| **Orchestrator** | Workflow Control | FSM decisions | Agent spawns + commands | Variable expansion |

## 📈 Key Features & Benefits

### ⚡ Performance & Reliability
- **Iterative Error Resolution**: Handles complex interdependent errors through sequential processing
- **Mandatory Verification**: Every fix is validated through compilation before proceeding
- **Loop Protection**: Detects when fixes introduce new errors and handles gracefully
- **Maximum Iterations**: Prevents infinite loops with configurable iteration limits

### 🧠 Intelligence & Learning
- **Knowledge Accumulation**: Error recovery handbook grows with each successful upgrade
- **Pattern Recognition**: Learns from previous fixes to suggest similar solutions
- **Confidence Scoring**: Each fix includes confidence metrics for manual review guidance
- **Evidence-Based Fixes**: Prioritizes solutions found in official PR artifacts

### 🔧 Developer Experience
- **Zero Configuration**: Self-contained with all required assets bundled
- **Progress Transparency**: Real-time status tracking with detailed progress reports
- **Comprehensive Reporting**: Multiple report types for different stakeholder needs
- **Resume Capability**: Can resume interrupted upgrades from any state

### Key Components

- **Scout**: Downloads PR artifacts and release notes from GitHub
- **Orchestrator**: State machine that manages the upgrade workflow
- **Build Worker (polkadot-bug-fixer)**: Fixes compilation errors by symbol groups
- **Tests Worker (polkadot-tests-fixer)**: Fixes test failures by module
- **Error Groupers**: Python tools that parse and group errors

### Agent Collaboration

The agents collaborate through shared files that enable learning and knowledge transfer:

- **Error Recovery Handbook** (`resources/error_recovery_handbook.md`): 
  - Worker agents append successful fixes to this handbook
  - Subsequent agents check this file first for known solutions
  - Contains a "Fixed Errors Database" that grows with each successful fix
  - Format includes: symbol, error message, fix applied, and SDK version

- **Status File** (`output/status.json`):
  - Central coordination file tracking all error groups and test groups
  - Updated by orchestrator and workers to track progress
  - Prevents duplicate work and enables resumption

- **Upgrade Report** (`output/UPGRADE_REPORT_<NEW_TAG>.md`):
  - Build workers document all fixes applied
  - Includes confidence scores and manual review recommendations
  - Shared knowledge base for the upgrade session

## Quick Start

### Prerequisites

- GitHub CLI (`gh`) authenticated
- Claude CLI installed
- Python 3.x
- jq

### Usage

```bash
# Install agents to your project (optional, for Claude Code users)
make install-agents

# Run complete upgrade process
make run-upgrade OLD_TAG=polkadot-stable2407 NEW_TAG=polkadot-stable2410

# Or run phases separately:
# 1. Gather PR data
./scripts/scout.sh polkadot-stable2410

# 2. Execute upgrade
./scripts/runner.sh polkadot-stable2407 polkadot-stable2410
```

## Directory Structure

```
sdk-upgrader/
├── agents/           # AI agent specifications
├── prompts/          # Orchestrator YAML configurations
├── scripts/          # Scripts and utilities  
├── resources/        # Scout data, handbook, migrations
├── docker/           # Docker environment
└── output/           # Generated reports
```

### Resources Directory

The `resources/` directory contains:

```
resources/
├── error_recovery_handbook.md    # Knowledge base of successful fixes
├── common_migrations.yaml        # Common migration patterns
└── scout/                        # Scout outputs (gitignored)
    └── polkadot-sdk-<NEW_TAG>/
        ├── release-notes.md      # Official release notes
        └── pr-<number>/          # For each PR in the release
            ├── description.md    # PR description and migration notes
            └── patch.diff        # Actual code changes
```

### Output Directory

The upgrade process generates these artifacts in `output/`:

```
output/
├── status.json                      # Real-time progress tracking
├── UPGRADE_REPORT_<NEW_TAG>.md      # Main upgrade report with all fixes
├── test_report_<NEW_TAG>.md         # Test fixing details
├── error_summary_<NEW_TAG>.md       # Summary of unfixed compilation errors
└── test_error_summary_<NEW_TAG>.md  # Summary of unfixed test failures
```

**File Descriptions:**
- **status.json**: Tracks error groups, test groups, iterations, and completion status
- **UPGRADE_REPORT**: Documents all applied fixes, migration patterns, and manual interventions needed
- **test_report**: Details test fixes applied and patterns discovered
- **error_summary**: Generated only if max iterations reached with remaining errors
- **test_error_summary**: Generated only if max iterations reached with failing tests

## Beta Status

This tool is in public beta. Please report issues and contribute improvements!