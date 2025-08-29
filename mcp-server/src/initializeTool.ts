import * as fs from 'fs/promises';
import * as path from 'path';
import winston from 'winston';

// Bundled subagent definitions
const POLKADOT_BUG_FIXER = `---
name: polkadot-bug-fixer
description: Rust compilation error fix specialist. Fixes compilation errors in Rust projects with specialized knowledge of Polkadot SDK migrations. Uses Serena MCP tools and rust-docs.
---

# Rust Bug Fixer Agent

You are a Rust compilation error fix specialist with deep knowledge of Polkadot SDK migrations. You fix compilation errors based on flexible descriptions, validate all changes, and output structured results.

## Configuration

**Input Parameters:**
- \`error_description\`: Natural language string ("fix xcm errors") or JSON with error details
- \`resources_dir\`: Optional path to resources directory (contains handbook, scout artifacts, migrations)
- \`project_root\`: Root directory of the codebase (default: current directory)

## Guiding Principles

- **Verify, Then Act**: Always attempt to reproduce the error before fixing it, and always validate the fix by compiling the code
- **Minimalism**: Make the smallest possible change to fix the error. Do not refactor unrelated code
- **Focused Scope**: Fix ONLY the errors specified in the input. Ignore all other compilation errors
- **Tool-First**: You MUST use the provided tools for all interactions with the environment
- **Evidence-Based Fixes**: Prioritize fixes based on concrete evidence from the handbook or scout PRs
- **Confidence Tracking**: Always assign and document confidence scores for each fix
- **Bounded Retries**: Limit fix attempts to maximum 3 per error to prevent infinite loops
- **Validation Required**: Never skip the validation step - all fixes must be verified through compilation
- **Handbook Updates**: ALWAYS update the error recovery handbook with successful fixes

## Execution Workflow

1. Parse input and understand the error
2. Check the error recovery handbook for similar fixes
3. Analyze scout PR artifacts if available
4. Apply the fix using appropriate tools
5. Validate the fix with cargo check
6. Update the handbook with successful fixes
7. Output structured JSON results`;

const POLKADOT_TESTS_FIXER = `---
name: polkadot-tests-fixer  
description: Rust test fix specialist. Fixes failing tests after Polkadot SDK upgrades. Processes specific test groups, validates all fixes through test execution.
---

# Rust Test Fixer Agent

You are a Rust test fix specialist with deep knowledge of Polkadot SDK migrations. You fix failing tests after SDK upgrades by processing specific test groups, validating all changes through test execution.

## Configuration

**Input Parameters:**
- \`test_group_id\`: Identifier for the test group to fix
- \`test_group\`: Test group data containing module and test names
- \`new_tag\`: Target SDK version tag
- \`old_tag\`: Previous SDK version tag
- \`resources_dir\`: Optional path to resources directory

## Guiding Principles

- **Test Isolation**: Process tests individually for better error isolation
- **Mandatory Validation**: ALWAYS run cargo test after every fix attempt
- **Focused Scope**: Fix ONLY tests in the assigned group
- **Evidence-Based Fixes**: Prioritize fixes from handbook and scout PRs
- **Bounded Retries**: Maximum 3 fix attempts per test
- **Knowledge Building**: Document all successful fixes in the handbook
- **Clean Commits**: Group related test fixes in meaningful commits
- **Tool-First**: Use provided tools for all environment interactions

## Execution Workflow

1. Validate assignment and parse test group
2. Check handbook for similar test fixes
3. Analyze scout PR artifacts for API changes
4. Fix each test individually
5. Validate fixes with cargo test
6. Document successful fixes
7. Output structured JSON results`;

// Resource file templates
const ERROR_RECOVERY_HANDBOOK = `# Error Recovery Handbook

This handbook contains proven fixes for common Polkadot SDK compilation and test errors.
Each entry is indexed by symbol for quick lookup during error resolution.

## Format

Each fix entry follows this format:

### SYMBOL: error_type
- **Error**: Description of the error
- **Fix**: The solution that worked
- **Confidence**: Score from 0.0 to 1.0
- **Context**: Additional information

## Fixes

<!-- Entries will be appended here by the agents -->
`;

const COMMON_MIGRATIONS = `# Common Polkadot SDK Migrations

This file contains common migration patterns between Polkadot SDK versions.

## Trait Migrations

### Currency → Fungible
- Old: \`use frame_support::traits::Currency;\`
- New: \`use frame_support::traits::fungible::Fungible;\`

### StorageVersion
- Old: \`use frame_support::traits::StorageVersion;\`  
- New: \`use frame_support::traits::OnRuntimeUpgrade;\`

## Type Changes

### Weight
- Old: \`Weight::from_ref_time(x)\`
- New: \`Weight::from_parts(x, 0)\`

### Balance
- Old: \`T::Balance\`
- New: \`BalanceOf<T>\`

## Common Fixes

### Missing trait bounds
Add \`+ TypeInfo\` to type parameters that are stored

### Async trait changes
Replace \`async_trait\` with native async syntax

<!-- Additional migrations will be discovered and added -->
`;

// Scout script for downloading PR artifacts
const SCOUT_SCRIPT = `#!/bin/bash

# Scout: Polkadot-SDK Release Data Harvester
# Downloads PR artifacts for a given SDK release tag

set -e

usage() {
  echo "Usage: $0 [-f] [-o <output-dir>] <release-tag>"
  echo "Options:"
  echo "  -f, --force   Overwrite existing release directory if present"
  echo "  -o, --output  Base directory where release data will be placed"
  echo "  -h, --help    Show this help message"
  echo "Example: $0 polkadot-stable2409"
}

# CLI args
FORCE=false
OUTPUT_BASE=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--force)
      FORCE=true
      shift
      ;;
    -o|--output)
      OUTPUT_BASE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done
set -- "\${POSITIONAL[@]}"

RELEASE_TAG=$(echo "$1" | xargs)

if [ -z "$RELEASE_TAG" ]; then
  usage
  exit 1
fi

echo "Scout is starting its mission for release: $RELEASE_TAG"

# Fetch release notes
echo "Fetching release notes from GitHub..."
RELEASE_BODY=$(gh release view "$RELEASE_TAG" --repo paritytech/polkadot-sdk --json body -q .body 2>/dev/null || true)

if [ -z "$RELEASE_BODY" ]; then
    echo "Error: could not fetch release notes for tag '$RELEASE_TAG'."
    echo "Ensure GitHub CLI is installed and authenticated via 'gh auth login'"
    exit 1
fi

echo "Extracting PR numbers from release notes..."
# Extract PR numbers using various patterns
URL_NUMS=$(echo "$RELEASE_BODY" | grep -oE 'https://github\\.com/paritytech/polkadot-sdk/pull/[0-9]+' | sed 's#.*/##' || true)
BRACKET_NUMS=$(echo "$RELEASE_BODY" | grep -oE '\\[#([0-9]+)\\]:' | grep -oE '[0-9]+' || true)
BRACKET_HEAD_NUMS=$(echo "$RELEASE_BODY" | grep -oE '^#### \\[#([0-9]+)\\]' | grep -oE '[0-9]+' || true)
BRACKET_NO_COLON=$(echo "$RELEASE_BODY" | grep -oE '\\[#([0-9]+)\\]' | grep -oE '[0-9]+' || true)
PAREN_NUMS=$(echo "$RELEASE_BODY" | grep -oE '\\(#([0-9]+)\\)' | grep -oE '[0-9]+' || true)
SLASH_NUMS=$(echo "$RELEASE_BODY" | grep -oE 'polkadot-sdk/[0-9]+' | grep -oE '[0-9]+' || true)
GH_SHORTHAND_NUMS=$(echo "$RELEASE_BODY" | grep -oE 'paritytech/polkadot-sdk#[0-9]+' | grep -oE '[0-9]+' || true)

PR_NUMBERS_RAW=$(printf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$URL_NUMS" "$BRACKET_NUMS" "$BRACKET_HEAD_NUMS" "$BRACKET_NO_COLON" "$PAREN_NUMS" "$SLASH_NUMS" "$GH_SHORTHAND_NUMS" | grep -v '^$' | sort -u)

if [ -z "$PR_NUMBERS_RAW" ]; then
  echo "No PR references found in the release notes."
  exit 1
fi

PR_COUNT=$(echo "$PR_NUMBERS_RAW" | wc -l | tr -d ' ')
echo "Found \${PR_COUNT} PR numbers."

# Determine output directory
if [ -n "$OUTPUT_BASE" ]; then
  if [ "\${OUTPUT_BASE:0:1}" != "/" ]; then
    OUTPUT_BASE="$PWD/$OUTPUT_BASE"
  fi
else
  OUTPUT_BASE="./resources/scout"
fi

RELEASE_DIR="\${OUTPUT_BASE}/polkadot-sdk-\${RELEASE_TAG}"
if [ -d "$RELEASE_DIR" ]; then
  if [ "$FORCE" = true ]; then
    rm -rf "$RELEASE_DIR"
  else
    if [ -n "$(ls -A "$RELEASE_DIR" 2>/dev/null)" ]; then
      echo "Directory $RELEASE_DIR already exists. Use --force to overwrite."
      exit 0
    fi
  fi
fi

mkdir -p "$RELEASE_DIR"
echo "Created directory: $RELEASE_DIR"

# Save release notes and PR lists
echo "$RELEASE_BODY" > "\${RELEASE_DIR}/release-notes.md"
echo "$PR_NUMBERS_RAW" > "\${RELEASE_DIR}/declared_prs.txt"

# Process each PR
while IFS= read -r num; do
  PR_URL="https://github.com/paritytech/polkadot-sdk/pull/\${num}"
  PR_NUMBER="$num"
  
  echo "Processing PR #\${PR_NUMBER}..."
  
  PR_DIR="\${RELEASE_DIR}/pr-\${PR_NUMBER}"
  mkdir -p "$PR_DIR"
  
  # Fetch PR description
  echo "  Fetching description..."
  if ! gh pr view "$PR_URL" --json body -q .body > "\${PR_DIR}/description.md"; then
    echo "  Warning: failed to fetch PR description for #\${PR_NUMBER}."
    continue
  fi
  
  # Fetch PR diff
  echo "  Fetching diff..."
  if ! curl -sSfL -o "\${PR_DIR}/patch.diff" "\${PR_URL}.diff"; then
    echo "  Warning: failed to download diff for #\${PR_NUMBER}."
    continue
  fi
  
  echo "  Done."
done <<< "$PR_NUMBERS_RAW"

echo "Scout mission complete for release: $RELEASE_TAG"
`;

// Script templates
const CHECK_BUILD_SCRIPT = `#!/bin/bash

# Get the git repository root
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT" || exit 1

# Generate a unique filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="/tmp/cargo_messages_\${TIMESTAMP}.json"

echo "🔄 Building from: $PROJECT_ROOT"

# Run cargo check and collect ALL compiler messages (errors, warnings, notes, help)
MESSAGES=$(cargo check --all-targets --message-format=json 2>/dev/null | \\
    jq -c 'select(.reason == "compiler-message") | {
        message: .message.message,
        code: .message.code,
        level: .message.level,
        spans: .message.spans,
        children: .message.children,
        rendered: .message.rendered
    }')

# Get the exit code from cargo check
CARGO_EXIT_CODE=\${PIPESTATUS[0]}

# Write messages to file
echo "[\$MESSAGES]" | jq -s 'add // []' > "\$OUTPUT_FILE"

# Output the filename for the error grouper
echo "📝 Messages saved to: \$OUTPUT_FILE"

# Exit with cargo's exit code
exit \$CARGO_EXIT_CODE
`;

const CHECK_TEST_BUILD_SCRIPT = `#!/bin/bash

# Get the git repository root
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT" || exit 1

# Generate a unique filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="/tmp/cargo_test_messages_\${TIMESTAMP}.json"

echo "🔄 Building tests from: $PROJECT_ROOT"

# Run cargo test --no-run and collect ALL compiler messages
MESSAGES=$(cargo test --no-run --all-targets --message-format=json 2>/dev/null | \\
    jq -c 'select(.reason == "compiler-message") | {
        message: .message.message,
        code: .message.code,
        level: .message.level,
        spans: .message.spans,
        children: .message.children,
        rendered: .message.rendered
    }')

# Get the exit code from cargo test
CARGO_EXIT_CODE=\${PIPESTATUS[0]}

# Check if there are any messages captured
if [ -z "$MESSAGES" ]; then
    echo "✅ No errors found - all tests compiled successfully"
else
    # Create JSON array from the messages
    echo "[" > "$OUTPUT_FILE"
    echo "$MESSAGES" | sed '$!s/$/,/' >> "$OUTPUT_FILE"
    echo "]" >> "$OUTPUT_FILE"
    
    # Count errors specifically
    ERROR_COUNT=$(jq -r '[.[] | select(.level == "error")] | length' < "$OUTPUT_FILE" 2>/dev/null || echo "0")
    
    if [ $ERROR_COUNT -eq 0 ]; then
        echo "✅ No errors found - test compilation successful"
    else
        echo "❌ Found $ERROR_COUNT error(s) - saved to: $OUTPUT_FILE"
    fi
fi

# Exit with cargo's exit code
exit \$CARGO_EXIT_CODE
`;

const ERROR_GROUPER_SCRIPT = `#!/usr/bin/env python3
"""
Dynamic error grouper for cargo check and cargo test outputs.
Reads JSON from a file and groups errors by error code (E0308, E0502, etc).
"""

import json
import sys
import re
from collections import defaultdict


def extract_symbol(message):
    """Extract any code symbol from an error message for additional context."""
    code_match = re.search(r'\`([^\`]+)\`', message)
    if code_match:
        symbol = code_match.group(1)
        if '::' in symbol:
            return symbol.split('::')[-1]
        return symbol
    return "unknown"


def parse_json_input(json_array):
    """Parse the JSON array from check_build.sh or check_test_build.sh."""
    errors = []
    
    for item in json_array:
        if 'message' in item and 'code' in item:
            error_code = 'unknown'
            if isinstance(item.get('code'), dict):
                error_code = item['code'].get('code', 'unknown')
            elif isinstance(item.get('code'), str):
                error_code = item['code']
            
            error_info = {
                'type': 'build',
                'message': item.get('message', ''),
                'code': error_code,
                'file': None,
                'line': None,
                'symbol': extract_symbol(item.get('message', ''))
            }
            
            if 'spans' in item and item['spans']:
                primary_span = next((s for s in item['spans'] if s.get('is_primary')), item['spans'][0])
                if primary_span:
                    error_info['file'] = primary_span.get('file_name')
                    error_info['line'] = primary_span.get('line_start')
            
            if 'error' in item.get('level', ''):
                errors.append(error_info)
    
    return errors


def group_errors_by_code(errors, max_per_group=10):
    """Group errors by error code, then by symbol within each code."""
    grouped = defaultdict(lambda: defaultdict(list))
    
    for error in errors:
        error_code = error['code']
        symbol = error.get('symbol', 'unknown')
        
        if len(grouped[error_code][symbol]) < max_per_group:
            grouped[error_code][symbol].append(error)
    
    result_groups = []
    for error_code, symbols in grouped.items():
        for symbol, error_list in symbols.items():
            result_groups.append({
                'error_code': error_code,
                'symbol': symbol,
                'count': len(error_list),
                'errors': error_list
            })
    
    return sorted(result_groups, key=lambda x: x['count'], reverse=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: error_grouper.py <json_file>", file=sys.stderr)
        sys.exit(1)
    
    json_file = sys.argv[1]
    max_per_group = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    try:
        with open(json_file, 'r') as f:
            json_data = json.load(f)
    except Exception as e:
        print(json.dumps({'error': f'Failed to read JSON file: {e}'}))
        sys.exit(1)
    
    errors = parse_json_input(json_data if isinstance(json_data, list) else [json_data])
    error_groups = group_errors_by_code(errors, max_per_group)
    
    output = {
        'total_errors': len(errors),
        'total_groups': len(error_groups),
        'error_groups': error_groups
    }
    
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
`;

export class InitializeTool {
  constructor(private logger: winston.Logger) {}

  /**
   * Initialize a project with all required directories and files for the orchestrator
   */
  async execute(params: {
    projectPath?: string;
  }): Promise<{ success: boolean; message?: string; created?: string[]; error?: string }> {
    try {
      // Default to 'sdk-upgrade' directory if no path provided
      const projectPath = params.projectPath || path.join(process.cwd(), 'sdk-upgrade');
      const created: string[] = [];
      
      this.logger.info(`Initializing project at: ${projectPath}`);

      // Check if already initialized
      const agentPath = path.join(projectPath, '.claude/agents/polkadot-bug-fixer.md');
      try {
        await fs.access(agentPath);
        return {
          success: true,
          message: 'Project already initialized',
          created: []
        };
      } catch {
        // Not initialized, continue
      }

      // Create directory structure
      const directories = [
        '.claude/agents',
        'output',
        'resources/scout',
        'scripts'
      ];

      for (const dir of directories) {
        const dirPath = path.join(projectPath, dir);
        await fs.mkdir(dirPath, { recursive: true });
        created.push(`DIR: ${dir}`);
        this.logger.info(`Created directory: ${dir}`);
      }

      // Write subagent files
      const agents = [
        { name: 'polkadot-bug-fixer.md', content: POLKADOT_BUG_FIXER },
        { name: 'polkadot-tests-fixer.md', content: POLKADOT_TESTS_FIXER }
      ];

      for (const agent of agents) {
        const agentPath = path.join(projectPath, '.claude/agents', agent.name);
        await fs.writeFile(agentPath, agent.content, 'utf-8');
        created.push(`AGENT: .claude/agents/${agent.name}`);
        this.logger.info(`Created agent: ${agent.name}`);
      }

      // Write resource files
      const resources = [
        { path: 'resources/error_recovery_handbook.md', content: ERROR_RECOVERY_HANDBOOK },
        { path: 'resources/common_migrations.yaml', content: COMMON_MIGRATIONS }
      ];

      for (const resource of resources) {
        const resourcePath = path.join(projectPath, resource.path);
        await fs.writeFile(resourcePath, resource.content, 'utf-8');
        created.push(`RESOURCE: ${resource.path}`);
        this.logger.info(`Created resource: ${resource.path}`);
      }

      // Write script files
      const scripts = [
        { name: 'scout.sh', content: SCOUT_SCRIPT },
        { name: 'check_build.sh', content: CHECK_BUILD_SCRIPT },
        { name: 'check_test_build.sh', content: CHECK_TEST_BUILD_SCRIPT },
        { name: 'error_grouper.py', content: ERROR_GROUPER_SCRIPT }
      ];

      for (const script of scripts) {
        const scriptPath = path.join(projectPath, 'scripts', script.name);
        await fs.writeFile(scriptPath, script.content, 'utf-8');
        // Make scripts executable
        await fs.chmod(scriptPath, '755');
        created.push(`SCRIPT: scripts/${script.name}`);
        this.logger.info(`Created script: ${script.name}`);
      }

      // Create .gitignore in project root to ignore the entire output directory
      const gitignorePath = path.join(projectPath, '.gitignore');
      const gitignoreContent = `# Ignore entire output directory
output/

# Ignore scout artifacts
resources/scout/

# Ignore error recovery handbook (it gets updated during runs)
resources/error_recovery_handbook.md
`;
      await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8');
      created.push('FILE: .gitignore');
      this.logger.info('Created .gitignore in project root');

      return {
        success: true,
        message: `Project initialized successfully at ${projectPath}`,
        created
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Initialize tool failed:', error);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}