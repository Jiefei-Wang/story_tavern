import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useAgentStore } from '../../stores/useAgentStore';
import { useAgentGroupStore } from '../../stores/useAgentGroupStore';
import { useBackendStore } from '../../stores/useBackendStore';
import { DEFAULT_STORY_WORKFLOW, runWorkflow, validateWorkflows, type Workflow } from '../../engine/workflows/Workflow';

const field = 'w-full border rounded-lg p-3 bg-white text-sm';
export function WorkflowsPage() {
  const { record, save, saving, load } = useLibraryStore();
  const { agents } = useAgentStore(), { groups, activeGroupId } = useAgentGroupStore();
  const [draft, setDraft] = useState(JSON.stringify(record.data.workflows || {}, null, 2));
  const [revision, setRevision] = useState(record.revision), [dirty, setDirty] = useState(false);
  const [storyWorkflowId, setStoryWorkflowId] = useState(record.data.storyWorkflowId || '');
  const [selected, setSelected] = useState(''), [groupId, setGroupId] = useState(activeGroupId);
  const [input, setInput] = useState(''), [output, setOutput] = useState(''), [status, setStatus] = useState('');
  const [running, setRunning] = useState(false), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!dirty) { setDraft(JSON.stringify(record.data.workflows || {}, null, 2)); setRevision(record.revision); setStoryWorkflowId(record.data.storyWorkflowId || ''); }
  }, [record, dirty]);
  const flows = Object.values(record.data.workflows || {});
  const selectedId = flows.some(f => f.id === selected) ? selected : flows[0]?.id || '';
  async function persist() {
    try {
      const workflows = JSON.parse(draft);
      validateWorkflows(workflows, agents);
      await save({ ...record.data, workflows, storyWorkflowId: storyWorkflowId || null }, revision);
      setDirty(false); setStatus('流程已保存');
    } catch (e) { setStatus(e instanceof Error ? e.message : '保存失败'); }
  }
  function addStory() {
    try {
      const workflows = JSON.parse(draft), id = `story_${Date.now()}`;
      setDraft(JSON.stringify({ ...workflows, [id]: { ...structuredClone(DEFAULT_STORY_WORKFLOW), id } }, null, 2));
      setDirty(true); setStatus('已复制默认故事组合，可更换各阶段 Agent 后保存');
    } catch { setStatus('请先修正 JSON'); }
  }
  function add() {
    try {
      const workflows = JSON.parse(draft), id = `flow_${Date.now()}`;
      const agent = agents.find(a => !a.id.startsWith('text_') && a.id !== 'model_refusal_detector') || agents[0];
      const flow: Workflow = { id, name: '新文本组合', steps: [{ id: 'answer', agentId: agent?.id || '请选择Agent', inputs: { input: { from: 'input' } } }], output: { from: 'step', stepId: 'answer', pointer: '' } };
      setDraft(JSON.stringify({ ...workflows, [id]: flow }, null, 2)); setDirty(true);
      setStatus('请填写 agentId 和提示词需要的输入映射，再保存');
    } catch { setStatus('请先修正 JSON'); }
  }
  async function run() {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setRunning(true); setOutput(''); setStatus('运行中…');
    try {
      const result = await runWorkflow(record.data.workflows![selectedId], input, { agents, groups, backends: useBackendStore.getState().backends, groupId, signal: abort.signal });
      setOutput(result); setStatus('运行完成');
    } catch (e) { setStatus(abort.signal.aborted ? '已取消' : e instanceof Error ? e.message : '运行失败'); }
    finally { controller.current = null; setRunning(false); }
  }
  return <div className="max-w-4xl mx-auto space-y-5 p-6">
    <h1 className="text-xl font-bold">文本组合</h1>
    <p className="text-sm text-slate-600">游戏与独立文本任务共用组合执行器。选择故事组合后，从下一回合生效；独立运行只展示文本。</p>
    <p className="text-sm"><Link className="text-blue-600" to="/agents/new">创建 Agent</Link> · <Link className="text-blue-600" to="/agent-groups">配置模型绑定</Link></p>
    <details open><summary className="font-medium cursor-pointer">编辑组合配置</summary>
      <p className="text-sm my-3">每个流程包含 id、name、steps、output。输入来源为 {`{"from":"input"}`} 或 {`{"from":"step","stepId":"前面步骤ID","pointer":""}`}。pointer 可选择 /text 等结果字段。删除对应流程条目即可删除组合。</p>
      <p className="text-sm my-3">故事阶段提供经校验的角色创建、交互设计和正文生成，只能在游戏中运行。普通步骤可通过 {`{"from":"context","pointer":"/history"}`} 读取游戏提供的 world、characters、player、history；独立运行没有这些材料。</p>
      <label className="block mb-3">游戏使用的组合<select aria-label="游戏使用的组合" className={field} disabled={saving || running} value={storyWorkflowId} onChange={e => { setStoryWorkflowId(e.target.value); setDirty(true); }}><option value="">默认故事组合</option>{flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="block">流程 JSON<textarea aria-label="流程 JSON" className={`${field} font-mono mt-2`} rows={15} value={draft} disabled={saving || running} onChange={e => { setDraft(e.target.value); setDirty(true); }} /></label>
      <div className="flex flex-wrap gap-4 mt-3"><button disabled={saving || running} onClick={add}>添加组合</button><button disabled={saving || running} onClick={addStory}>复制默认故事组合</button><button disabled={saving || running || !dirty} onClick={persist}>保存配置</button><button disabled={saving || running} onClick={async () => { try { await load(); setDirty(false); setDraft(JSON.stringify(useLibraryStore.getState().record.data.workflows || {}, null, 2)); setRevision(useLibraryStore.getState().record.revision); setStoryWorkflowId(useLibraryStore.getState().record.data.storyWorkflowId || ''); setStatus('已重新载入'); } catch { setStatus('重新载入失败'); } }}>放弃草稿并重新载入</button></div>
      {dirty && revision !== record.revision && <p role="alert">配置已变化。请复制需要保留的草稿，再重新载入。</p>}
    </details>
    <div className="grid grid-cols-2 gap-4">
      <label>已保存组合<select aria-label="已保存组合" className={field} value={selectedId} disabled={running} onChange={e => setSelected(e.target.value)}><option value="" disabled>请选择</option>{flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label>模型组<select aria-label="组合模型组" className={field} value={groupId} disabled={running} onChange={e => setGroupId(e.target.value)}>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    </div>
    <label className="block">输入<textarea aria-label="组合输入" className={field} rows={4} value={input} onChange={e => setInput(e.target.value)} disabled={running} /></label>
    <div className="flex gap-4"><button className="bg-blue-600 text-white rounded-lg px-4 py-2 disabled:opacity-50" disabled={running || dirty || !selectedId || !input.trim()} onClick={run}>运行组合</button><button disabled={!running} onClick={() => controller.current?.abort()}>取消</button></div>
    <p role="status" className="text-sm">{status}</p>
    {output && <section aria-label="组合结果" className="whitespace-pre-wrap break-words bg-white border rounded-xl p-5">{output}</section>}
  </div>;
}
