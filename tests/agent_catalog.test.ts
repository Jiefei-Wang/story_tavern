import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS, RETIRED_AGENT_IDS } from '../src/db/initialData';
import { StorageService, storageService } from '../src/db/storage';
import { createStorySave, defaultLibrary } from '../src/engine/library/Library';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { useGameStore } from '../src/stores/useGameStore';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { readAssistantConfiguration, executeAssistantChanges, type Resources } from '../src/engine/assistantConfiguration';
import { assistantReplySchema } from '../src/engine/modelAssistant';

test('empty database has complete static defaults; cleanup preserves current configuration and assistant editing', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string,string>();
  Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
  const stores = [useAgentStore, useAgentGroupStore, useBackendStore, useGameStore, useSettingsStore] as const;
  const states = stores.map(s=>s.getState());
  try {
    const storage = new StorageService();
    await storage.initDatabase();
    const expected = ['model_refusal_detector','text_character_designer','text_outline_designer','text_router','text_storyteller'];
    assert.deepEqual((await storage.getAgents()).map(a=>a.id).sort(), expected);
    assert.equal((await storage.getBackends()).length, DEFAULT_BACKENDS.length);
    assert.ok((await storage.getLibrary())?.data.stories.harbor_story);
    for (const group of await storage.getAgentGroups()) {
      assert.deepEqual(group.bindings.map(b=>b.agentId).sort(), expected);
      assert.ok(group.bindings.every(b=>b.model && DEFAULT_BACKENDS.some(d=>d.id===b.backendId)));
    }
    const router = {...structuredClone(BUILTIN_AGENTS[0]),name:'自定义路由',future:{keep:true}};
    const detector = {...structuredClone(BUILTIN_AGENTS.find(a => a.id === 'model_refusal_detector')!),name:'保留检测配置',future:{detector:true}};
    await storage.saveAgent(router); await storage.saveAgent(detector);
    for (const id of RETIRED_AGENT_IDS) await storage.saveAgent({...structuredClone(router),id});
    const fast = {...structuredClone(DEFAULT_AGENT_GROUPS[0]),futureGroup:true};
    fast.bindings[0].model = 'custom-current-model';
    fast.bindings.push({...fast.bindings[0],agentId:'input_compiler'});
    await storage.saveAgentGroup(fast);
    await storage.saveAgentGroup({id:'group_unit_test',name:'旧评测',bindings:[{...fast.bindings[0],agentId:'model_refusal_detector'}]});
    const save = createStorySave(defaultLibrary(),'harbor_story','group_unit_test');
    await storage.saveGame(save);
    const dirty = {...structuredClone(save),name:'未保存进度'};
    useGameStore.setState({saves:[dirty],activeSave:dirty});
    values.set('model_assistant_model','independent-model'); values.set('secret_test','synthetic-private');
    await storage.initDatabase();
    assert.deepEqual((await storage.getAgents()).map(a=>a.id).sort(),expected);
    assert.deepEqual((await storage.getAgents()).find(a=>a.id===detector.id),detector);
    assert.equal((await storage.getAgentGroups()).length,3);
    const cleanFast = (await storage.getAgentGroups()).find(g=>g.id==='group_fast')!;
    assert.equal(cleanFast.bindings[0].model,'custom-current-model');
    assert.equal((cleanFast as any).futureGroup,true);
    const saved = (await storage.getSaves())[0];
    assert.equal(saved.activeAgentGroupId,'group_fast');
    assert.deepEqual(saved.turns,save.turns);
    assert.deepEqual(saved.textWorld?.documents,save.textWorld?.documents);
    assert.equal(useGameStore.getState().activeSave,dirty);
    const once = new Map(values); await storage.initDatabase(); assert.deepEqual(values,once);
    useAgentStore.setState({agents:await storage.getAgents()});
    useAgentGroupStore.setState({groups:await storage.getAgentGroups(),activeGroupId:'group_fast'});
    useBackendStore.setState({backends:await storage.getBackends()});
    useSettingsStore.setState({settings:await storage.getSettings()});
    // The UI's unsaved save is independent; use its valid current group for config validation.
    useGameStore.setState({saves:[],activeSave:null});
    const snapshot = readAssistantConfiguration();
    assert.equal((snapshot.resources as Resources).agents.model_refusal_detector.name,detector.name);
    assert.ok(!JSON.stringify(snapshot).includes('synthetic-private'));
    const reply = assistantReplySchema.parse({reply:'',actions:[{type:'patch_config',resource:'agents',patches:[{op:'replace',path:'/text_router/name',value:'新路由名'}]}]});
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(executeAssistantChanges(reply,snapshot,cancelled.signal,()=>{}));
    await executeAssistantChanges(reply,snapshot,new AbortController().signal,()=>{});
    assert.equal((await storageService.getAgents()).find(a=>a.id==='text_router')?.name,'新路由名');
    assert.deepEqual((useAgentStore.getState().agents.find(a=>a.id==='text_router') as any).future,{keep:true});
    await assert.rejects(executeAssistantChanges(reply,snapshot,new AbortController().signal,()=>{}),/配置已变化/);
    const beforeFailure = values.get('story_tavern_agents');
    const original = storageService.saveAgent;
    try {
      storageService.saveAgent = async()=>{throw new Error('synthetic disk failure');};
      const reports:string[]=[];
      const changed = assistantReplySchema.parse({reply:'',actions:[{type:'patch_config',resource:'agents',patches:[{op:'replace',path:'/text_router/name',value:'失败修改'}]}]});
      await assert.rejects(executeAssistantChanges(changed,readAssistantConfiguration(),new AbortController().signal,m=>reports.push(m)), /synthetic disk failure/);
      assert.ok(!reports.some(r=>r.includes('已保存')));
      assert.equal(values.get('story_tavern_agents'),beforeFailure);
    } finally {storageService.saveAgent=original;}
    assert.equal(values.get('model_assistant_model'),'independent-model');
    assert.equal(values.get('secret_test'),'synthetic-private');
  } finally {
    stores.forEach((s,i)=>(s.setState as any)(states[i]));
    if(descriptor) Object.defineProperty(globalThis,'localStorage',descriptor); else delete (globalThis as any).localStorage;
  }
});


test('Designer cleanup migrates missing bindings, removes old role, preserves custom groups and is idempotent', async () => {
  const { reconcileAgentCatalog } = await import('../src/db/agentCatalog');
  const legacy = { ...structuredClone(BUILTIN_AGENTS[0]), id: 'text_designer', name: '旧自定义设计', future: true };
  const agents = [legacy];
  const binding = { agentId: 'text_designer', backendId: 'private-backend', model: 'custom-designer', overrides: { temperature: 0.23 }, future: { keep: true } };
  const groups = ['group_fast', 'custom'].map(id => ({ id, name: id, bindings: [structuredClone(binding)] }));
  const storage: any = {
    getAgents: async () => structuredClone(agents), saveAgent: async (a: any) => { agents.push(a); }, deleteAgent: async (id: string) => { const i = agents.findIndex(a => a.id === id); if (i >= 0) agents.splice(i, 1); },
    getAgentGroups: async () => structuredClone(groups), saveAgentGroup: async (g: any) => { const i = groups.findIndex(x => x.id === g.id); if (i < 0) groups.push(g); else groups[i] = g; },
    deleteAgentGroup: async () => {}, getSaves: async () => [], saveGame: async () => { throw new Error('must not touch saves'); },
  };
  await reconcileAgentCatalog(storage);
  for (const id of ['group_fast', 'custom']) {
    const group = groups.find(g => g.id === id)!;
    for (const agentId of ['text_character_designer', 'text_outline_designer'])
      assert.deepEqual(group.bindings.find(b => b.agentId === agentId), { ...binding, agentId });
  }
  assert(!agents.some(a => a.id === 'text_designer'));
  assert(groups.every(g => !g.bindings.some(b => b.agentId === 'text_designer')));
  groups[0].bindings.find(b => b.agentId === 'text_outline_designer')!.model = 'new-choice';
  const before = structuredClone({ agents, groups });
  await reconcileAgentCatalog(storage);
  assert.deepEqual({ agents, groups }, before);
});
