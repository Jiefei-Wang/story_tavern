"""Register only the authorized three behavior roles and unit test bindings, with conflict checks."""
import argparse,json,os,sqlite3,datetime
from pathlib import Path
p=json.loads(Path('artifacts/behavior-tests/register-behavior-roles.json').read_text(encoding='utf8'))
parser=argparse.ArgumentParser()
parser.add_argument('--expected-previous')
args=parser.parse_args()
previous=json.loads(Path(args.expected_previous).read_text(encoding='utf8')) if args.expected_previous else {'agents':[]}
roles={'action_adjudicator','narration_auditor','character_change_auditor'}
assert len(p['agents'])==3 and {a['id'] for a in p['agents']}==roles
assert len(p['bindings'])==3 and {b['agentId'] for b in p['bindings']}==roles
db=Path(os.environ['APPDATA'])/'story_tavern'/'story_tavern.db'
c=sqlite3.connect(db.as_uri()+'?mode=rw',uri=True)
with c:
 c.execute('BEGIN IMMEDIATE')
 raw=c.execute('SELECT data FROM agent_groups WHERE id=?',('group_unit_test',)).fetchone()[0]
 group=json.loads(raw)
 assert group['name']=='unit test'
 stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
 for a in p['agents']:
  old=c.execute('SELECT data FROM agents WHERE id=?',(a['id'],)).fetchone()
  if old and json.loads(old[0])!=a:
   expected=next((v for v in previous['agents'] if v['id']==a['id']),None)
   if json.loads(old[0])!=expected:raise RuntimeError('Existing role differs from expected snapshot; refusing overwrite')
   c.execute('UPDATE agents SET data=?,updated_at=? WHERE id=?',(json.dumps(a,ensure_ascii=False),stamp,a['id']))
  if not old:c.execute('INSERT INTO agents(id,data,updated_at) VALUES(?,?,?)',(a['id'],json.dumps(a,ensure_ascii=False),stamp))
 for binding in p['bindings']:
  existing=next((b for b in group['bindings'] if b['agentId']==binding['agentId']),None)
  if existing and existing!=binding:raise RuntimeError('Existing role binding differs; refusing overwrite')
  if not existing:group['bindings'].append(binding)
 c.execute('UPDATE agent_groups SET data=?,updated_at=? WHERE id=?',(json.dumps(group,ensure_ascii=False),stamp,'group_unit_test'))
assert json.loads(c.execute('SELECT data FROM agent_groups WHERE id=?',('group_unit_test',)).fetchone()[0])==group
print('Verified: three behavior roles registered; original unit test bindings and Fast preserved.')
