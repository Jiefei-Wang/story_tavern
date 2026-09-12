"""Register the requested detector and its one unit-test binding; preserve all other configuration."""
import argparse,datetime,json,os,sqlite3
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--expected-previous', help='Previous registration snapshot; compare before updating the detector only')
args=parser.parse_args()
p=Path('artifacts/behavior-tests/refusal/register.json')
payload=json.loads(p.read_text(encoding='utf8'))
agent,binding=payload['agent'],payload['binding']
assert agent['id']==binding['agentId']=='model_refusal_detector'
assert [i['name'] for i in agent['inputs']]==['responseText']
db=Path(os.environ['APPDATA'])/'story_tavern'/'story_tavern.db'
c=sqlite3.connect(db.as_uri()+'?mode=rw',uri=True)
unit=json.loads(c.execute('SELECT data FROM agent_groups WHERE id=?',('group_unit_test',)).fetchone()[0])
assert unit['name']=='unit test'
existing=c.execute('SELECT data FROM agents WHERE id=?',(agent['id'],)).fetchone()
if existing and json.loads(existing[0])!=agent:
 if not args.expected_previous: raise RuntimeError('Existing detector has user changes; not overwriting')
 expected=json.loads(Path(args.expected_previous).read_text(encoding='utf8'))['agent']
 if json.loads(existing[0])!=expected: raise RuntimeError('Detector changed since expected snapshot; not overwriting')
oldbinding=next((b for b in unit['bindings'] if b['agentId']==agent['id']),None)
if oldbinding and oldbinding!=binding: raise RuntimeError('Existing detector binding differs; not overwriting')
if not oldbinding: unit['bindings'].append(binding)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
with c:
 if not existing: c.execute('INSERT INTO agents(id,data,updated_at) VALUES(?,?,?)',(agent['id'],json.dumps(agent,ensure_ascii=False),now))
 elif json.loads(existing[0])!=agent:
  changed=c.execute('UPDATE agents SET data=?,updated_at=? WHERE id=? AND data=?',(json.dumps(agent,ensure_ascii=False),now,agent['id'],existing[0])).rowcount
  if changed!=1: raise RuntimeError('Concurrent detector edit; update cancelled')
 if not oldbinding: c.execute('UPDATE agent_groups SET data=?,updated_at=? WHERE id=?',(json.dumps(unit,ensure_ascii=False),now,unit['id']))
assert json.loads(c.execute('SELECT data FROM agent_groups WHERE id=?',(unit['id'],)).fetchone()[0])['bindings']==unit['bindings']
assert json.loads(c.execute('SELECT data FROM agents WHERE id=?',(agent['id'],)).fetchone()[0])==agent
print('Registered model_refusal_detector and unit test binding; original bindings and Fast group preserved.')
