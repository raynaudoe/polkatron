#!/usr/bin/env python3
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
    code_match = re.search(r'`([^`]+)`', message)
    if code_match:
        symbol = code_match.group(1)
        if '::' in symbol:
            return symbol.split('::')[-1]
        return symbol
    return "unknown"


def parse_json_input(items_iterable):
    """Parse cargo JSON items (from an array or NDJSON stream)."""
    errors = []

    for item in items_iterable:
        if not isinstance(item, dict):
            continue

        # Case 1: Raw cargo NDJSON with reason == "compiler-message"
        if item.get('reason') == 'compiler-message' and isinstance(item.get('message'), dict):
            msg = item['message']
            message_text = msg.get('message', '')
            code_field = msg.get('code')
            if isinstance(code_field, dict):
                error_code = code_field.get('code', 'unknown')
            elif isinstance(code_field, str):
                error_code = code_field
            else:
                error_code = 'unknown'

            spans = msg.get('spans') or []
            error_info = {
                'type': 'build',
                'message': message_text,
                'code': error_code,
                'file': None,
                'line': None,
                'symbol': extract_symbol(message_text)
            }

            if spans:
                primary_span = next((s for s in spans if s.get('is_primary')), spans[0])
                if primary_span:
                    error_info['file'] = primary_span.get('file_name')
                    error_info['line'] = primary_span.get('line_start')

            if 'error' in (msg.get('level') or ''):
                errors.append(error_info)

        # Case 2: Already-flattened message object from prior scripts
        elif 'message' in item and ('code' in item or 'level' in item):
            code_field = item.get('code')
            if isinstance(code_field, dict):
                error_code = code_field.get('code', 'unknown')
            elif isinstance(code_field, str):
                error_code = code_field
            else:
                error_code = 'unknown'

            message_text = item.get('message', '')
            spans = item.get('spans') or []
            error_info = {
                'type': 'build',
                'message': message_text,
                'code': error_code,
                'file': None,
                'line': None,
                'symbol': extract_symbol(message_text)
            }

            if spans:
                primary_span = next((s for s in spans if s.get('is_primary')), spans[0])
                if primary_span:
                    error_info['file'] = primary_span.get('file_name')
                    error_info['line'] = primary_span.get('line_start')

            if 'error' in (item.get('level') or ''):
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
    
    items = []
    try:
        # First try: parse as a single JSON value (array or object)
        with open(json_file, 'r') as f:
            content = f.read()
        try:
            data = json.loads(content)
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                items = [data]
            else:
                items = []
        except json.JSONDecodeError:
            # Fall back to NDJSON: parse line by line, ignoring blank/invalid lines
            items = []
            for line in content.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    items.append(obj)
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(json.dumps({'error': f'Failed to read JSON file: {e}'}))
        sys.exit(1)

    errors = parse_json_input(items)
    error_groups = group_errors_by_code(errors, max_per_group)
    
    output = {
        'total_errors': len(errors),
        'total_groups': len(error_groups),
        'error_groups': error_groups
    }
    
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
