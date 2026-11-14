#!/usr/bin/env python3
"""Dependency-free specification integrity checks, not application verification."""
from pathlib import Path
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
errors = []
def require(condition, message):
    if not condition:
        errors.append(message)
def load(path):
    return json.loads((ROOT / path).read_text())

for path in ROOT.rglob('*.json'):
    try:
        json.loads(path.read_text())
    except Exception as exc:
        errors.append(f'{path.relative_to(ROOT)}: invalid JSON: {exc}')
for path in ROOT.rglob('*.md'):
    text = path.read_text()
    for raw in re.findall(r'\]\(([^)]+)\)', text):
        target = raw.strip().split(' "')[0].strip('<>')
        if re.match(r'^(https?://|mailto:|#)', target):
            continue
        target = target.split('#')[0]
        if target:
            resolved = (path.parent / target).resolve()
            require(resolved.is_relative_to(ROOT) and resolved.exists(),
                    f'{path.relative_to(ROOT)}: broken/escaping link: {target}')
for path in ROOT.rglob('*.svg'):
    try:
        node = ET.parse(path).getroot()
        require(node.tag.endswith('svg'), f'{path}: not SVG')
        require('script' not in path.read_text().lower(), f'{path}: script in SVG')
    except Exception as exc:
        errors.append(f'{path}: invalid SVG: {exc}')

locales = load('config/locales.json')
codes = [r['code'] for r in locales['locales']]
require(len(codes) == locales['launchLocaleCount'] == 110, 'Locale count must be 110')
require(len(codes) == len(set(codes)), 'Duplicate locale identifier')
require(all(r['status'] == 'planned' for r in locales['locales']),
        'Baseline must not fabricate translation readiness')
require(all(r['direction'] in ('rtl', 'ltr') for r in locales['locales']), 'Invalid direction')
wheel = load('contracts/wheel.schema.json')
require(wheel['properties']['locale']['enum'] == codes, 'Wheel locale enum drift')
limits = load('config/limits.json')
require(wheel['properties']['entries']['maxItems'] == limits['entries']['max'], 'Entry limit drift')
require(wheel['properties']['settings']['properties']['spinSeconds']['maximum'] == limits['motion']['maxSeconds'], 'Motion limit drift')
api = load('contracts/openapi.json')
canonical = {k:v for k,v in wheel.items() if k not in ('$schema', '$id')}
require(api['components']['schemas']['Wheel'] == canonical, 'Embedded API Wheel schema drift')
require(api['components']['schemas']['CreateShareRequest']['properties']['ttlDays']['enum'] == limits['sharing']['allowedTtlDays'], 'Share TTL drift')
ops = []
def visit_refs(node):
    if isinstance(node, dict):
        if '$ref' in node and node['$ref'].startswith('#/'):
            cur = api
            try:
                for part in node['$ref'][2:].split('/'):
                    cur = cur[part.replace('~1','/').replace('~0','~')]
            except (KeyError, TypeError):
                errors.append('Broken OpenAPI reference: ' + node['$ref'])
        for value in node.values(): visit_refs(value)
    elif isinstance(node, list):
        for value in node: visit_refs(value)
visit_refs(api)
for route, item in api['paths'].items():
    for verb, op in item.items():
        if verb in ('get', 'post', 'put', 'patch', 'delete'):
            ops.append(op['operationId'])
            require(bool(op['responses']), f'{route} {verb}: no responses')
require(len(ops) == len(set(ops)), 'Duplicate API operationId')

admin = load('contracts/admin.openapi.json')
saved_api = api
api = admin
visit_refs(admin)
admin_ops = [op['operationId'] for item in admin['paths'].values() for verb, op in item.items() if verb in ('get','post','put','patch','delete')]
require(len(admin_ops) == len(set(admin_ops)), 'Duplicate admin operationId')
api = saved_api

required_ids = ['SEL-01','SEL-02','GAM-01','GAM-02','UX-01','MOT-01','TXT-01','DAT-01',
                'REP-01','SHR-01','LOC-01','SEO-01','PWA-01','ADS-01','PRI-01','ADM-01','OPS-01']
product = (ROOT/'docs/01-PRODUCT.md').read_text()
acceptance = (ROOT/'docs/16-ACCEPTANCE.md').read_text()
for rid in required_ids:
    require(rid in product and rid in acceptance, f'Unmapped requirement {rid}')
example = load('contracts/examples/wheel.json')
require(example['locale'] in codes, 'Fixture locale missing')
require(len({e['id'] for e in example['entries']}) == len(example['entries']), 'Duplicate fixture entry ID')
require(len(list((ROOT/'docs/assets/icons').glob('*.svg'))) >= 24, 'Missing icon set')
if errors:
    print('\n'.join('FAIL: '+e for e in errors))
    sys.exit(1)
print(f'PASS: links, JSON, SVG, {len(codes)} locales, schema alignment, {len(ops)} public + {len(admin_ops)} admin API operations and {len(required_ids)} acceptance IDs')
print('Scope: documentation integrity only; application gates remain NOT RUN.')
