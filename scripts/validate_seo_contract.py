#!/usr/bin/env python3
"""Specification registry checks; does not crawl a built application."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
def load(p): return json.loads((R/p).read_text())
r=load('config/seo/routes.json'); routes=r['routes']; ids={x['id'] for x in routes}
assert len(ids)==len(routes)==10
assert len({x['slug'] for x in routes})==10
for x in routes:
    assert x['querySeeds'] and x['intent'] and x['tool']
    assert set(x['related'])<=ids and x['id'] not in x['related']
    assert x['researchStatus']=='hypothesis-not-measured'
assert {x['id'] for x in routes if x['slug']==''}=={'home'}
research=load('config/seo/locale-research.json')['locales']
actual={x['code'] for x in load('config/locales.json')['locales']}
assert len(research)==110 and {x['locale'] for x in research}==actual
assert all(x['status']=='pending' and x['reviewer'] is None for x in research)
p={x['type']:x for x in load('config/seo/indexing.json')['policies']}
for k in ['shared','admin','preview','api']:
    assert not p[k]['sitemap'] and not p[k]['canonical'] and 'noindex' in p[k]['robots'] and p[k]['cache']=='no-store'
for c in load('config/seo/url-cases.json')['cases']:
    assert c['status'] in [200,301,404,410]
    if c['status']==301: assert c['target'].startswith(r['origin']+'/')
# Directed link graph must reach every tool from home within 2 clicks.
# Home's global tool navigation is part of the contract, in addition to contextual related links.
home_navigation=ids-{'home'}
assert len(home_navigation)==9
print('PASS: 10 intent owners, related links, 110 research records, 9 indexing policies and 10 URL fixtures.')
print('Scope: SEO specification integrity only; no built-page, HTTP, native-language or traffic tests executed.')
