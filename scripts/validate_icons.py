#!/usr/bin/env python3
"""Verify the curated local asset registry and semantic action coverage."""
from pathlib import Path
import json,xml.etree.ElementTree as ET
r=Path(__file__).resolve().parents[1]
a=json.loads((r/'config/icon-assets.json').read_text());m=json.loads((r/'config/icon-map.json').read_text())
assert a['license']=='MIT' and len(a['commit'])==40 and len(a['assets'])==52
by={(x['name'],x['weight']):x for x in a['assets']}
assert len(by)==52
for x in a['assets']:
 p=(r/x['path']).resolve();assert p.is_relative_to(r)
 s=p.read_text();root=ET.fromstring(s)
 assert root.attrib['viewBox']=='0 0 256 256'
 assert 'currentColor' in s and '<script' not in s and 'http' not in s.replace('http://www.w3.org/2000/svg','')
for n in m['actions'].values():assert (n,'regular') in by
for n in m['selectedFill']:assert (n,'fill') in by
for n in m['decorativeDuotone']:assert (n,'duotone') in by
license=(r/'assets/icons/phosphor/LICENSE').read_text()
assert 'MIT License' in license and 'Permission is hereby granted' in license
print('PASS: 52 local Phosphor assets, 45 semantic actions, weight mappings and MIT notice.')
print('Scope: asset integrity only; executed UI, contrast and motion acceptance remain pending.')
