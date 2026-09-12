import fs from 'node:fs';
import { BUILTIN_AGENTS } from '../src/db/initialData';
import { REFUSAL_DETECTOR } from '../src/engine/evaluation/RefusalDetector';
const root='artifacts/behavior-tests';
const config=JSON.parse(fs.readFileSync(`${root}/unit-test-config.json`,'utf8'));
const group=config.groups.find((g:any)=>g.id==='group_unit_test' && g.name==='unit test');
if(!group) throw Error('unit test group required');
const roles=[['action_adjudicator','world_resolver'],['narration_auditor','narrator'],['character_change_auditor','world_resolver']];
for(const [agentId,sourceId] of roles) {
 if(!group.bindings.some((b:any)=>b.agentId===agentId)) {
  const source=group.bindings.find((b:any)=>b.agentId===sourceId);
  if(!source) throw Error(`Missing source ${sourceId}`);
  group.bindings.push({...structuredClone(source),agentId});
 }
}
config.agents=[...structuredClone(BUILTIN_AGENTS),structuredClone(REFUSAL_DETECTOR)];
fs.writeFileSync(`${root}/unit-test-config.fixed.json`,JSON.stringify(config,null,2));
fs.writeFileSync(`${root}/register-behavior-roles.json`,JSON.stringify({agents:config.agents.filter((a:any)=>roles.some(([id])=>id===a.id)),bindings:group.bindings.filter((b:any)=>roles.some(([id])=>id===b.agentId))},null,2));
console.log('Exported current behavior protocols; original model bindings and baseline evidence preserved.');
