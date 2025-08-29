#!/bin/bash

# Get the git repository root
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT" || exit 1

# Generate a unique filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="/tmp/cargo_messages_${TIMESTAMP}.json"

echo "🔄 Building from: $PROJECT_ROOT"

# Run cargo check and write the entire JSON output stream (NDJSON) to file
cargo check --all-targets --message-format=json 1>"$OUTPUT_FILE" 2>/dev/null

# Get the exit code from cargo check
CARGO_EXIT_CODE=$?

# Output the filename and a summary (jq used only for trivial counting)
echo "📝 Messages saved to: $OUTPUT_FILE"

if command -v jq >/dev/null 2>&1; then
    ERROR_COUNT=$(jq -c 'select(.reason=="compiler-message" and .message.level=="error")' "$OUTPUT_FILE" 2>/dev/null | wc -l | tr -d ' ')
    if [ -n "$ERROR_COUNT" ]; then
        if [ "$ERROR_COUNT" -eq 0 ]; then
            echo "✅ No errors found - build successful"
        else
            echo "❌ Found $ERROR_COUNT error(s)"
        fi
    fi
fi

# Exit with cargo's exit code
exit $CARGO_EXIT_CODE
