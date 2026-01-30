#!/usr/bin/env python3
import json
import sys

data = json.load(sys.stdin)
for field in data.get('result', {}).get('fields', []):
    if field['name'] == 'StageName':
        print('CURRENT STAGE PICKLIST VALUES:')
        print('='*60)
        for pv in field.get('picklistValues', []):
            active = '[ACTIVE]' if pv.get('active') else '[INACTIVE]'
            flags = []
            if pv.get('closed', False):
                flags.append('CLOSED')
            if pv.get('won', False):
                flags.append('WON')
            flag_str = f" → {', '.join(flags)}" if flags else ""
            print(f"  {active} {pv['value']}{flag_str}")
