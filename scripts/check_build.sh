#!/bin/bash

# Generate a unique filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="/tmp/cargo_messages_${TIMESTAMP}.json"

echo "🔄 Building..."

# Run cargo check and collect ALL compiler messages (errors, warnings, notes, help)
# Suppress stderr output (progress messages) and capture only JSON from stdout
# Use --all-targets to check all crates and targets
MESSAGES=$(cargo check --all-targets --message-format=json 2>/dev/null | \
    jq -c 'select(.reason == "compiler-message") | {
        message: .message.message,
        code: .message.code,
        level: .message.level,
        spans: .message.spans,
        children: .message.children,
        rendered: .message.rendered
    }')

# Get the exit code from cargo check
CARGO_EXIT_CODE=${PIPESTATUS[0]}

# Check if jq failed
JQ_EXIT_CODE=${PIPESTATUS[1]:-0}
if [ "$JQ_EXIT_CODE" -ne 0 ]; then
    echo "❌ Error: Failed to parse cargo output JSON"
    exit $CARGO_EXIT_CODE
fi

# Check if there are any messages captured
if [ -z "$MESSAGES" ]; then
    echo "✅ No errors found - all code compiled successfully"
else
    # Create JSON array from the messages
    echo "[" > "$OUTPUT_FILE"
    echo "$MESSAGES" | sed '$!s/$/,/' >> "$OUTPUT_FILE"
    echo "]" >> "$OUTPUT_FILE"
    
    # Validate file creation
    if [ ! -f "$OUTPUT_FILE" ]; then
        echo "❌ Error: Failed to create output file"
        exit 1
    fi
    
    # Pretty-print the JSON file
    if ! jq '.' "$OUTPUT_FILE" > "${OUTPUT_FILE}.tmp"; then
        echo "❌ Error: Failed to format JSON output"
        exit 1
    fi
    mv "${OUTPUT_FILE}.tmp" "$OUTPUT_FILE"
    
    # Count messages properly using jq
    MESSAGE_COUNT=$(jq -s 'length' < "$OUTPUT_FILE")
    
    # Count errors specifically
    ERROR_COUNT=$(jq -r '[.[] | select(.level == "error")] | length' < "$OUTPUT_FILE")
    
    if [ $ERROR_COUNT -eq 0 ]; then
        echo "✅ No errors found - captured $MESSAGE_COUNT compiler message(s) (warnings/notes) saved to: $OUTPUT_FILE"
    else
        echo "❌ Found $ERROR_COUNT error(s) out of $MESSAGE_COUNT total compiler messages - saved to: $OUTPUT_FILE"
    fi
fi

# Exit with cargo's exit code
exit $CARGO_EXIT_CODE