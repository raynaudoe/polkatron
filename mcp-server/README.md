# 🚀 Polkadot SDK Upgrader MCP Server

**Self-contained MCP server** that enables Polkadot SDK upgrades through Claude Code CLI without nested subagent limitations.

## ✨ Features

- **Solves nested subagent problem** - Orchestrator runs in main Claude context
- **Fully self-contained** - Orchestrator prompt bundled inside the server
- **Zero configuration** - No external files needed
- **Preserves specialization** - Orchestrator can spawn all subagents
- **Direct Claude integration** - No API dependencies
- **Native slash commands** - Tools exposed as `/mcp__sdk-upgrader__initialize` and `/mcp__sdk-upgrader__sdk_upgrade`

## 🏗️ Architecture

```
User → Claude CLI → MCP Server → Returns orchestrator prompt → Claude executes in MAIN context → Spawns subagents
```

The MCP server contains the complete orchestrator prompt, expands variables, and returns it to Claude to execute in the main agent context, avoiding nested subagent restrictions.

## ⚡ Quick Start

### Prerequisites
- [Claude Code CLI](https://claude.ai/code) installed and authenticated
- Node.js 18+

### 1. Install Globally
```bash
npm install -g @polkatron/sdk-upgrader-mcp
```

### 2. Register with Claude Code CLI
```bash
claude mcp add --scope user sdk-upgrader stdio://sdk-upgrader-mcp
```

### 3. Verify Installation
```bash
claude mcp list
# Should show: sdk-upgrader
```

### 4. Initialize Your Project (Required!)
```bash
# In your Polkadot project directory, ask Claude:
"Use initialize to set up the required files"
```

### 5. Run SDK Upgrade
```bash
# Now you can upgrade:
"Use sdk_upgrade with oldTag='polkadot-stable2407' and newTag='polkadot-stable2409'"
```

## 🛠️ Development Setup

For development or contributing:

```bash
git clone https://github.com/polkatron/mcp-server
cd mcp-server
bun install
bun run build
claude mcp add --scope user sdk-upgrader stdio://$(pwd)/dist/index.js
```

## 🛠️ Usage

The MCP server exposes two tools as both MCP tools and slash commands:

### Slash Commands (Recommended)
```bash
# Type / in Claude Code to see these commands:
/mcp__sdk-upgrader__initialize    # Initialize project structure
/mcp__sdk-upgrader__sdk_upgrade   # Upgrade SDK (requires oldTag and newTag)
```

### Direct Tool Usage
```bash
# Or use tools directly:
"Use initialize to set up the project"
```

### 1. `initialize` - Setup Required Files (Run First!)

Initializes the project with all required subagent files and directories:

This creates:
- `.claude/agents/` - Subagent definition files (polkadot-bug-fixer.md, polkadot-tests-fixer.md)
- `output/` - FSM state tracking and reports  
- `resources/` - Error recovery handbook and migration patterns
- `scripts/` - Helper scripts (check_build.sh, error_grouper.py)
- `prompts/` - Additional prompt templates

**Important**: This step is mandatory before running sdk_upgrade. The orchestrator needs these subagent files to spawn specialized agents.

### 2. `sdk_upgrade` - Perform the SDK Upgrade

After initialization, upgrade your SDK:

```bash
# In Claude Code:
"Use the sdk_upgrade tool with oldTag='polkadot-stable2407' and newTag='polkadot-stable2409'"
```

Claude will:
1. Call the MCP `sdk_upgrade` tool with the specified parameters
2. Receive the fully expanded orchestrator prompt (with all variables replaced)
3. Execute the orchestrator FSM in the **main agent context**
4. The orchestrator spawns specialized subagents from `.claude/agents/`:
   - `polkadot-bug-fixer` for compilation errors
   - `polkadot-tests-fixer` for test failures

### Tool Parameters

**`initialize`**
- `projectPath` (optional): Project directory (defaults to current directory)

**`sdk_upgrade`**
- `oldTag` (required): Current SDK version (e.g., "polkadot-stable2407")
- `newTag` (required): Target SDK version (e.g., "polkadot-stable2409")  
- `projectPath` (optional): Project directory (defaults to current directory)

## 📖 How It Works

### Step 1: Project Initialization
1. **MCP server's `initialize`** creates all required files
2. **Installs subagent definitions** to `.claude/agents/` directory
3. **Creates resource directories** for orchestrator FSM operation
4. **Includes scout.sh script** for downloading PR artifacts

### Step 2: SDK Upgrade Process  
1. **MCP server receives `sdk_upgrade` call** with oldTag and newTag
2. **Uses bundled orchestrator prompt** (no external files)
3. **Expands all variables** ($OLD_TAG, $NEW_TAG, $PROJECT_ROOT, etc.)
4. **Returns expanded prompt** to Claude
5. **Claude executes orchestrator** in main context (not as subagent)
6. **Orchestrator workflow**:
   - First runs `scout.sh` to download PR artifacts (if not present)
   - Updates dependencies to new SDK version
   - Iteratively fixes compilation errors via subagents
   - Fixes test failures via test-specific subagents
7. **Orchestrator spawns subagents** from `.claude/agents/` directory

This avoids the nested subagent limitation since the orchestrator runs in Claude's main context and can access pre-installed subagent files.

## 🔧 Configuration

### Environment Variables
```bash
# Optional: Logging level
LOG_LEVEL=info
```

## 🧪 Testing

```bash
# For development
bun test
bun run build

# Test with Claude Code (after npm install -g)
claude "First use initialize, then use sdk_upgrade to upgrade from polkadot-stable2407 to polkadot-stable2409"
```

## 🛡️ Security Features

- **Variable expansion** - Safe replacement of environment variables
- **Path resolution** - Secure path handling for generated paths
- **Input validation** - Required parameters are checked
- **No command execution** - Server only returns prompts, doesn't execute commands

## 🔍 Troubleshooting

### Issue: Tool not appearing in Claude
**Solution:**
```bash
# Re-register the MCP server
claude mcp remove sdk-upgrader
claude mcp add --scope user sdk-upgrader stdio://$(pwd)/dist/index.js
claude mcp list
```

### Issue: "Subagent not found" errors
**Solution:** Run `initialize` first to install required subagent files in `.claude/agents/`

### Issue: Orchestrator not executing properly
**Solution:** 
- Ensure you've run `initialize` first
- Verify `.claude/agents/` contains polkadot-bug-fixer.md and polkadot-tests-fixer.md
- Check that Claude Code can access the project directory
- Ensure `scripts/` directory has check_build.sh and error_grouper.py

## 📊 Architecture Benefits

- **No nested subagents** - Orchestrator runs in main context
- **Full specialization preserved** - All subagents remain available
- **Minimal complexity** - ~110 lines of code + bundled prompt
- **Zero configuration** - No external files needed
- **Direct prompt execution** - Claude handles orchestration natively
- **No API dependencies** - Works with Claude Code CLI only

## 🚧 How the Nesting Problem is Solved

**The Problem:**
```
MCP Tool → Spawns orchestrator as subagent → ❌ Can't spawn more subagents
```

**The Solution:**
```
MCP Tool → Returns prompt content → Claude runs in main → ✅ Can spawn subagents
```

The key insight: Instead of the MCP server executing the orchestrator, it returns the orchestrator prompt for Claude to execute directly in the main agent context.

### What the Orchestrator Does
When Claude receives the orchestrator prompt from the MCP tool, it executes a complete FSM workflow:
- **State management** (INIT → UPDATE_DEPS → CHECK_ERRORS → etc.)
- **Error grouping** and delegation to specialized agents
- **Progress tracking** and reporting
- **Spawning subagents** like `polkadot-bug-fixer` and `polkadot-tests-fixer`

## 📝 Development

### Project Structure
```
mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── orchestratorTool.ts   # Prompt expander and config builder
│   └── initializeTool.ts     # Project initialization with subagents
├── tests/
│   └── orchestrator.test.ts  # Unit tests
├── dist/                     # Compiled JavaScript
├── package.json             # Dependencies
└── README.md               # This file
```

### Key Components
- **Bundled Prompt**: Complete orchestrator FSM workflow embedded in the code
- **Bundled Subagents**: polkadot-bug-fixer and polkadot-tests-fixer agents included
- **Variable Expansion**: Replaces $VAR and ${VAR} patterns with actual values
- **Path Generation**: Builds all required paths for the upgrade process
- **Project Initialization**: Creates all required files and directories for operation
- **MCP Prompts**: Exposes tools as native slash commands through prompts capability

## 📄 License

MIT License - see LICENSE file for details.

---

**🎯 Fully self-contained - no external files or configuration needed!**

The orchestrator runs in Claude's main context and can freely spawn all specialized subagents!