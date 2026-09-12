"""Clone the persisted Fast group; touch no saves, agents, settings or credentials."""
import argparse
import datetime
import json
import os
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument('--persist', action='store_true')
args = parser.parse_args()
db = Path(os.environ['APPDATA']) / 'story_tavern' / 'story_tavern.db'
out = Path('artifacts/behavior-tests')
out.mkdir(parents=True, exist_ok=True)
connection = sqlite3.connect(db.as_uri() + ('?mode=rw' if args.persist else '?mode=ro'), uri=True)
def records(table):
    return [json.loads(row[0]) for row in connection.execute(f'SELECT data FROM {table}')]
groups = records('agent_groups')
fast = next(g for g in groups if g['id'] == 'group_fast')
clone = json.loads(json.dumps(fast))
clone.update(id='group_unit_test', name='unit test', updatedAt=datetime.date.today().isoformat())
existing = next((g for g in groups if g['id'] == clone['id']), None)
if existing and (existing['name'] != clone['name'] or existing['bindings'] != clone['bindings']):
    raise RuntimeError('Existing unit test group differs; refusing to overwrite its configuration')
agents = {a['id'] for a in records('agents')}
backends = records('backends')
backend_ids = {b['id'] for b in backends}
assert all(b['agentId'] in agents and b['backendId'] in backend_ids for b in clone['bindings'])
if args.persist and not existing:
    with connection:
        connection.execute('INSERT INTO agent_groups(id,data,updated_at) VALUES(?,?,?)',
                           (clone['id'], json.dumps(clone, ensure_ascii=False), datetime.datetime.now(datetime.timezone.utc).isoformat()))
    saved = json.loads(connection.execute('SELECT data FROM agent_groups WHERE id=?', (clone['id'],)).fetchone()[0])
    assert saved == clone
safe_backends = [{k: v for k, v in b.items() if k in ['id', 'name', 'baseUrl', 'authType', 'secretRef', 'timeoutMs', 'maxConcurrency', 'enabled', 'models', 'defaultModel']} for b in backends]
for b in safe_backends:
    b['customHeaders'] = {}
snapshot = {'source': str(db), 'sourceGroupId': fast['id'], 'persisted': bool(args.persist or existing),
            'agentDefinitions': 'current repository BUILTIN_AGENTS; stored group bindings preserved exactly',
            'groups': [clone], 'backends': safe_backends}
(out / 'group-source.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'groupId': clone['id'], 'name': clone['name'], 'bindings': len(clone['bindings']),
                  'identicalToFast': clone['bindings'] == fast['bindings'], 'persisted': snapshot['persisted']}, ensure_ascii=False))
