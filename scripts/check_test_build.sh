#!/bin/bash

# Get the git repository root
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT" || exit 1

# Generate a unique filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="/tmp/cargo_test_messages_${TIMESTAMP}.json"

echo "🔄 Building tests from: $PROJECT_ROOT"

# Run cargo test --no-run and write the entire JSON output stream (NDJSON) to file
cargo test --no-run --all-targets --message-format=json 1>"$OUTPUT_FILE" 2>/dev/null

# Get the exit code from cargo test
CARGO_EXIT_CODE=$?

# Print a summary (jq used only for trivial counting if available)
if command -v jq >/dev/null 2>&1; then
    ERROR_COUNT=$(jq -c 'select(.reason=="compiler-message" and .message.level=="error")' "$OUTPUT_FILE" 2>/dev/null | wc -l | tr -d ' ')
    if [ -n "$ERROR_COUNT" ]; then
        if [ "$ERROR_COUNT" -eq 0 ]; then
            echo "✅ No errors found - all tests compiled successfully"
        else
            echo "❌ Found $ERROR_COUNT error(s) - saved to: $OUTPUT_FILE"
        fi
    fi
fi

# Exit with cargo's exit code
exit $CARGO_EXIT_CODE
