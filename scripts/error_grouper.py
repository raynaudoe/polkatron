#!/usr/bin/env python3
"""
Dynamic error grouper for cargo check and cargo test outputs.
Reads JSON from a file and groups errors by error code (E0308, E0502, etc).
No hardcoded error patterns - works with any current or future Rust errors.
"""

import json
import sys
import re
from collections import defaultdict


def extract_symbol(message):
    """Extract any code symbol from an error message for additional context."""
    # Simply extract the first code symbol in backticks, if any
    code_match = re.search(r'`([^`]+)`', message)
    if code_match:
        symbol = code_match.group(1)
        # For paths/imports, just get the last component
        if '::' in symbol:
            return symbol.split('::')[-1]
        return symbol
    
    # No symbol found - that's fine, we group by error code anyway
    return "unknown"


def parse_json_input(json_array):
    """Parse the JSON array from check_build.sh or check_test_build.sh."""
    errors = []
    
    for item in json_array:
        # Handle cargo check format
        if 'message' in item and 'code' in item:
            # Extract error code dynamically - this is now our primary grouping key
            error_code = 'unknown'
            if isinstance(item.get('code'), dict):
                error_code = item['code'].get('code', 'unknown')
            elif isinstance(item.get('code'), str):
                error_code = item['code']
            
            error_info = {
                'type': 'build',
                'message': item.get('message', ''),
                'code': error_code,  # Primary grouping key
                'file': None,
                'line': None,
                'symbol': None  # Secondary context
            }
            
            # Extract file info from spans
            if 'spans' in item:
                for span in item['spans']:
                    if span.get('is_primary'):
                        error_info['file'] = span.get('file_name')
                        error_info['line'] = span.get('line_start')
                        break
            
            # Symbol is secondary information for context
            error_info['symbol'] = extract_symbol(error_info['message'])
            errors.append(error_info)
        
        # Handle cargo test format (if we get test failures in JSON)
        elif 'test_name' in item or 'test_path' in item:
            error_info = {
                'type': 'test',
                'message': f"Test failed: {item.get('test_name', item.get('test_path', 'unknown'))}",
                'code': 'test_failure',
                'file': item.get('file'),
                'line': item.get('line'),
                'symbol': extract_symbol(item.get('test_name', item.get('test_path', '')))
            }
            errors.append(error_info)
    
    return errors


def group_errors(errors, max_per_group=10):
    """Group errors dynamically by error code, then by symbol for context."""
    # First group by error code (primary grouping)
    groups_by_code = defaultdict(list)
    for error in errors:
        groups_by_code[error['code']].append(error)
    
    # Sort by frequency (descending) - most common error codes first
    sorted_by_code = sorted(groups_by_code.items(), key=lambda x: len(x[1]), reverse=True)
    
    # Create work groups
    groups = []
    group_id = 1
    
    for error_code, code_errors in sorted_by_code:
        # Within each error code, sub-group by symbol for better context
        symbol_groups = defaultdict(list)
        for error in code_errors:
            symbol_groups[error.get('symbol', 'unknown')].append(error)
        
        # Sort symbols by frequency within this error code
        sorted_symbols = sorted(symbol_groups.items(), key=lambda x: len(x[1]), reverse=True)
        
        for symbol, symbol_errors in sorted_symbols:
            # Split large groups if needed
            for i in range(0, len(symbol_errors), max_per_group):
                batch = symbol_errors[i:i + max_per_group]
                error_type = batch[0]['type']
                
                group = {
                    'id': f'{error_type}_group_{group_id:03d}',
                    'type': error_type,
                    'error_code': error_code,  # Primary identifier
                    'symbol': symbol,           # Secondary context
                    'count': len(batch),
                    'errors': batch,
                    'status': 'pending',
                    'files': list(set(e['file'] for e in batch if e.get('file')))
                }
                
                # Add test-specific fields
                if error_type == 'test':
                    group['tests'] = [e['message'].replace('Test failed: ', '') for e in batch]
                    group['module'] = symbol  # For compatibility
                
                groups.append(group)
                group_id += 1
    
    return groups


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Dynamic error grouper')
    parser.add_argument('input_file', help='JSON input file to process (required)')
    parser.add_argument('--max-per-group', type=int, default=10,
                        help='Maximum errors per group (default: 10)')
    
    args = parser.parse_args()
    
    # Read JSON array from input file
    try:
        with open(args.input_file, 'r') as f:
            input_data = f.read().strip()
        
        if not input_data:
            print(json.dumps({'error_count': 0, 'groups': []}, indent=2))
            return
        
        # Parse as JSON array
        json_data = json.loads(input_data)
        if not isinstance(json_data, list):
            # If it's not a list, try to wrap it
            json_data = [json_data]
        
        # Parse and group errors
        errors = parse_json_input(json_data)
        groups = group_errors(errors, args.max_per_group)
        
        # Prepare output
        result = {
            'error_count': len(errors),
            'group_count': len(groups),
            'groups': groups
        }
        
        # Output result
        print(json.dumps(result, indent=2))
        
    except FileNotFoundError:
        print(json.dumps({
            'error': f'Input file not found: {args.input_file}',
            'error_count': 0,
            'groups': []
        }, indent=2), file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({
            'error': f'Invalid JSON in file {args.input_file}: {e}',
            'error_count': 0,
            'groups': []
        }, indent=2), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Unexpected error: {e}',
            'error_count': 0,
            'groups': []
        }, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()