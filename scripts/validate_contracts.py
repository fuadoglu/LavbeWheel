#!/usr/bin/env python3
"""Validate schemas and golden fixtures including rejection cases."""
from copy import deepcopy
from pathlib import Path
import json
import sys
try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    sys.exit('Install scripts/requirements-docs.txt before strict contract checks.')
ROOT=Path(__file__).resolve().parents[1]
def load(p): return json.loads((ROOT/p).read_text())
def validator(schema):
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())
checks=0
def accept(v,obj):
    global checks
    v.validate(obj); checks+=1
def reject(v,obj):
    global checks
    if not list(v.iter_errors(obj)): raise AssertionError('Invalid fixture was accepted')
    checks+=1
w=load('contracts/wheel.schema.json'); p=load('contracts/pack.schema.json')
wv,pv=validator(w),validator(p)
x=load('contracts/examples/wheel.json'); accept(wv,x)
y=deepcopy(x);y['entries'][0]['weight']=0;reject(wv,y)
y=deepcopy(x);y['entries']=[];reject(wv,y)
y=deepcopy(x);y['locale']='xx-INVALID';reject(wv,y)
y=deepcopy(x);y['entries'][0]['injectedHtml']='<script>';reject(wv,y)
for tool,field in [('numbers','range'),('teams','teamCount'),('bottle','seats'),('game','game')]:
    y=deepcopy(x);y['tool']=tool;reject(wv,y)
# Additional semantic combinations expressible in JSON Schema.
y=deepcopy(x);y['tool']='weighted';y['mode']='shuffled-cycle';reject(wv,y)
y=deepcopy(x);y['teamCount']=2;reject(wv,y)
y=deepcopy(x);y['tool']='yes-no';reject(wv,y)
y=deepcopy(x);y['tool']='numbers';y['range']={'min':1,'max':10};y['mode']='remove-winner';reject(wv,y)
y=deepcopy(x);y['tool']='weighted';accept(wv,y)
y=load('contracts/examples/pack.json');accept(pv,y)
y['review']['status']='reviewed';reject(pv,y)
sv=validator(load('contracts/session.schema.json')); session=load('contracts/examples/session.json');accept(sv,session)
bad=deepcopy(session);bad['results'][0]['sequence']=0;reject(sv,bad)
api=load('contracts/openapi.json')
# Resolve local schema refs into fixture schemas. No recursive schema references here.
def expand(obj):
    if isinstance(obj,dict):
        if '$ref' in obj:
            assert obj['$ref'].startswith('#/')
            cur=api
            for part in obj['$ref'][2:].split('/'):cur=cur[part]
            return expand(cur)
        return {k:expand(v) for k,v in obj.items()}
    if isinstance(obj,list):return [expand(v) for v in obj]
    return obj
for name,filename in [('CreateShareRequest','create-share'),('CreatedShare','share-created'),('SharedWheel','share-view'),('Error','error')]:
    v=validator(expand(api['components']['schemas'][name]));obj=load('contracts/examples/'+filename+'.json');accept(v,obj)
    obj['unexpected']=True;reject(v,obj)
for path in sorted((ROOT/'contracts/examples').glob('session-*.json')): accept(sv,json.loads(path.read_text()))
admin=load('contracts/admin.openapi.json')
for schema in admin['components']['schemas'].values(): Draft202012Validator.check_schema(schema)
for kind in ['pack','ui-catalog','seo-copy','legal','preset','integration']:
    vv=validator(load('contracts/admin-'+kind+'.schema.json')); xx=load('contracts/examples/admin-'+kind+'.json');accept(vv,xx)
    xx['unexpected']=True;reject(vv,xx)
admin_schema_checks = len(admin['components']['schemas'])
print(f'PASS: {checks} fixture acceptance/rejection checks; {admin_schema_checks} admin schema syntax checks.')
print('Scope: schemas and fixtures; no HTTP server, entropy engine or deployment tested.')
