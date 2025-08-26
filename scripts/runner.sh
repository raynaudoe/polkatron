#!/usr/bin/env zsh
#
# runner.sh — SDK Upgrade Runner for v2
#
# Usage:
#   make run-upgrade OLD_TAG=polkadot-stable2407 NEW_TAG=polkadot-stable2410
#
set -euo pipefail

# Parse arguments
if (( $# != 2 )); then
  echo "Usage: $0 <OLD_SDK_TAG> <NEW_SDK_TAG>" >&2
  exit 1
fi

OLD_TAG="$1"
NEW_TAG="$2"
SDK_BRANCH="${NEW_TAG#polkadot-}"

# Set paths
PROJECT_ROOT=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

PROMPT_DIR="${PROJECT_ROOT}"
OUTPUT_DIR="${PROJECT_ROOT}/output"
RESOURCES_DIR="${PROJECT_ROOT}/resources"
SCOUT_DIR="${RESOURCES_DIR}/scout/polkadot-sdk-${NEW_TAG}"
PROMPT_FILE="${PROJECT_ROOT}/prompts/orchestrator.yaml"
ERROR_GROUPER_PATH="${PROJECT_ROOT}/scripts/error_grouper.py"

# Check prerequisites
command -v claude >/dev/null 2>&1 || { echo "error: claude CLI not found" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "error: jq not found" >&2; exit 1; }
command -v envsubst >/dev/null 2>&1 || { echo "error: envsubst not found" >&2; exit 1; }

[[ ! -d "$SCOUT_DIR" ]] && { echo "error: scout directory '$SCOUT_DIR' not found" >&2; exit 1; }
[[ ! -f "$PROMPT_FILE" ]] && { echo "error: prompt file '$PROMPT_FILE' not found" >&2; exit 1; }

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Export variables for template substitution
export OLD_TAG NEW_TAG SDK_BRANCH PROJECT_ROOT PROMPT_DIR
export STATUS_FILE="${OUTPUT_DIR}/status.json"
export UPGRADE_REPORT_PATH="${OUTPUT_DIR}/UPGRADE_REPORT_${NEW_TAG}.md"
export TEST_REPORT_PATH="${OUTPUT_DIR}/test_report_${NEW_TAG}.md"
export RESOURCES_DIR SCOUT_DIR ERROR_GROUPER_PATH OUTPUT_DIR
export MAX_ITERATIONS="40"

# Format function from original runner.sh
format_claude_output() {
  export LC_ALL=C.UTF-8 2>/dev/null || export LC_ALL=en_US.UTF-8 2>/dev/null || true
  
  # ANSI colors
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  PURPLE='\033[0;35m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
  
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    if ! echo "$line" | jq . >/dev/null 2>&1; then
      echo "${DIM}$line${RESET}"
      continue
    fi

    type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
    subtype=$(echo "$line" | jq -r '.subtype // empty' 2>/dev/null)

    case "$type" in
      system)
        case "$subtype" in
          init)
            echo -e "\n${GREEN}${BOLD}🚀 Initializing Claude session${RESET}\n"
            ;;
          *)
            echo -e "${YELLOW}⚙️  System: ${subtype}${RESET}"
            ;;
        esac
        ;;

      assistant)
        content=$(echo "$line" | jq -r '.message.content[0].text // .content[0].text // empty' 2>/dev/null)
        [[ -n "$content" ]] && printf "${CYAN}%s${RESET}" "$content"
        
        tool_uses=$(echo "$line" | jq -r '.message.content[]? | select(.type == "tool_use") | .name' 2>/dev/null)
        if [[ -n "$tool_uses" ]]; then
          echo -e "\n\n${BLUE}${BOLD}🔧 Tool Call: ${tool_uses}${RESET}"
          # Extract and display the tool input/command
          tool_input=$(echo "$line" | jq -r '.message.content[]? | select(.type == "tool_use") | .input' 2>/dev/null)
          if [[ -n "$tool_input" ]]; then
            # Pretty print the JSON input with indentation
            echo -e "${DIM}📌 Command:${RESET}"
            echo "$tool_input" | jq . 2>/dev/null | sed 's/^/    /' || echo "    $tool_input"
          fi
        fi
        ;;

      user)
        tool_result=$(echo "$line" | jq -r '.message.content[]? | select(.type == "tool_result") | .content' 2>/dev/null)
        if [[ -n "$tool_result" ]]; then
          echo -e "\n${GREEN}📤 Tool Output:${RESET}"
          echo "$tool_result" | head -c 200 | sed 's/^/  /'
          echo -e "\n"
        fi
        ;;

      thinking)
        echo -e "\n${PURPLE}🤔 Thinking...${RESET}"
        ;;

      error)
        error_msg=$(echo "$line" | jq -r '.error // .message // "unknown error"' 2>/dev/null)
        echo -e "\n${RED}${BOLD}❌ Error: ${error_msg}${RESET}\n"
        ;;
        
      message_delta)
        delta_type=$(echo "$line" | jq -r '.delta.type // empty' 2>/dev/null)
        [[ "$delta_type" == "message_stop" ]] && echo ""
        ;;
    esac
  done
}

# Process template with environment variables
PROMPT_CONTENT=$(envsubst < "$PROMPT_FILE")

# Ensure we're in the main project directory before calling Claude
cd "$PROJECT_ROOT"

# Run Claude directly with the orchestrator prompt
echo "🤖 Starting SDK upgrade from $OLD_TAG to $NEW_TAG..."
claude -p "$PROMPT_CONTENT" \
       --model claude-opus-4-1-20250805 \
       --output-format stream-json \
       --verbose \
       --dangerously-skip-permissions \
    | format_claude_output

echo -e "\n✅ Upgrade process complete!"