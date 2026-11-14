#!/usr/bin/env python3
"""Golden semantic vectors; TS/PHP implementations must reproduce these results."""
from pathlib import Path
import json
import unicodedata
import regex
R=Path(__file__).resolve().parents[1]
def check(w):
    entries=w['entries']; ids=[e['id'] for e in entries]
    if len(ids)!=len(set(ids)): return 'DUPLICATE_ENTRY_ID'
    if any(len(regex.findall(r'\X',unicodedata.normalize('NFC',e['label'])))>120 for e in entries): return 'LABEL_TOO_LONG'
    if len(regex.findall(r'\X',unicodedata.normalize('NFC',w['title'])))>80:return 'TITLE_TOO_LONG'
    if w['tool']=='numbers':
        lo,hi=w['range']['min'],w['range']['max']
        if lo>hi or hi-lo+1>10000:return 'INVALID_RANGE'
    active=[e for e in entries if e['active']]; aids={e['id'] for e in active}
    if w['tool']=='teams' and (not 2<=w['teamCount']<=len(active) or any(e['weight']!=1 for e in active)):return 'INVALID_TEAM_COUNT'
    if w['tool']=='bottle' and (set(w['seats'])!=aids or len(w['seats'])!=len(aids) or not 2<=len(aids)<=20):return 'INVALID_SEATS'
    if (w['tool']!='weighted' and any(e['weight']!=1 for e in entries)) or (w['tool']=='weighted' and w['mode']=='shuffled-cycle'):return 'INVALID_WEIGHT_MODE'
    if w['tool']!='numbers' and not active:return 'NO_ACTIVE_ENTRIES'
    return 'OK'
if __name__=='__main__':
    vectors=json.loads((R/'contracts/semantic-vectors.json').read_text())
    for v in vectors:
        actual=check(v['wheel'])
        assert actual==v['expected'],(v['id'],actual,v['expected'])
    print(f'PASS: {len(vectors)} semantic golden vectors (reference checker only).')
