import { ConfigurationTarget } from '../../components/Common/ConfigurationTarget';
import { useRepositoryStore, useAgentEditorStore, useGroupEditorStore } from '../../stores/useRepositoryStore';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import type { AgentDefinition } from '../../types';
import { useBackendStore } from '../../stores/useBackendStore';
import { agentRuntime } from '../../engine/runtime/AgentRuntime';
import { getAgentPrompt, isStoryAgent, renderAgentPrompt, samplePromptContext, STORY_VARIABLES, validateAgentPrompt } from '../../engine/template/AgentPrompt';
import { assistantAgentSchema } from '../../engine/modelAssistant';
import { JsonViewer } from '../../components/Common/JsonViewer';
import { parseExtraBody } from '../AgentGroups/ExtraBodyEditor';

const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';

export const AgentEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const repository = useRepositoryStore();
  const { agents, saveAgent } = useAgentEditorStore();
  const { groups, activeGroupId } = useGroupEditorStore();
  const { backends } = useBackendStore();
  const [agent, setAgent] = useState<AgentDefinition | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [contextText, setContextText] = useState('');
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<any>(null);
  const [schema, setSchema] = useState('');
  const [extraBody, setExtraBody] = useState('{}');
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    const source = id === 'new' ? {
      id: `agent_${Date.now()}`, name: '新建 Agent', description: '', prompt: '请根据以下输入完成任务：\n{{input}}',
      messages: [], inputs: [], outputSchema: null, defaults: { temperature: 0.7, maxTokens: 0 },
    } : agents.find(a => a.id === id);
    if (!source) { setAgent(null); return; }
    setAgent({ ...structuredClone(source), prompt: getAgentPrompt(source) });
    setExtraBody(JSON.stringify(source.defaults.extraBody || {}, null, 2));
    setSchema(source.outputSchema ? JSON.stringify(source.outputSchema, null, 2) : '');
    setContextText(JSON.stringify(samplePromptContext(source), null, 2));
    setPreview(''); setResult(null); setStatus('');
  }, [id, agents]);
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => {
    useRepositoryStore.setState({ editorDirty: repository.target === 'repository' && status === '尚未保存' });
    return () => { useRepositoryStore.setState({ editorDirty: false }); };
  }, [status, repository.target]);

  if (!agent) return <div className="space-y-4"><ConfigurationTarget /><p className="text-slate-500">此编辑目标中没有该 Agent。</p><button onClick={() => navigate('/agents')}>返回 Agents</button></div>;
  const story = isStoryAgent(agent.id);
  const legacyText = agent.id.startsWith('text_');
  const group = groups.find(g => g.id === (repository.target === 'repository' ? 'group_fast' : activeGroupId));
  const binding = group?.bindings.find(b => b.agentId === agent.id);
  const backend = backends.find(b => b.id === binding?.backendId);
  const variables: Record<string, string> = story ? STORY_VARIABLES : agent.id === 'model_refusal_detector'
    ? { responseText: '被测模型的回复正文', retry: '格式重试反馈；首次调用为空' }
    : Object.fromEntries([...new Set(['input', ...agent.inputs.map(i => i.name)])].map(name => [name, '调用方提供的变量；测试时填写样本值']));
  const edit = (updates: Partial<AgentDefinition>) => { setAgent({ ...agent, ...updates }); setStatus('尚未保存'); setError(''); setPreview(''); setResult(null); };
  const draft = () => {
    const value = { ...agent, defaults: { ...agent.defaults, extraBody: parseExtraBody(extraBody) }, ...(!legacyText ? { outputSchema: schema.trim() ? JSON.parse(schema) : null } : {}) };
    validateAgentPrompt(value);
    assistantAgentSchema.parse(value);
    return value;
  };
  const save = async () => {
    setError(''); setSaving(true);
    try {
      const value = draft(); await saveAgent(value);
      if (id === 'new') navigate(`/agents/${encodeURIComponent(value.id)}`, { replace: true });
      setStatus(repository.target === 'repository' ? '已更新草稿，请点击保存仓库修改' : '已保存');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  const insert = (name: string) => {
    const input = promptInput.current, text = agent.prompt || '';
    const start = input?.selectionStart ?? text.length, end = input?.selectionEnd ?? start;
    const variable = `{{${name}}}`;
    edit({ prompt: text.slice(0, start) + variable + text.slice(end) });
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + variable.length, start + variable.length); });
  };
  const render = () => {
    const context = JSON.parse(contextText);
    if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('样本变量必须为 JSON 对象');
    const value = draft(), text = renderAgentPrompt(value, context);
    setPreview(text); return { value, context };
  };
  const test = async () => {
    setError(''); setResult(null);
    const controller = new AbortController(); running.current = controller;
    setTesting(true);
    try {
      const { value, context } = render();
      if (!group || !binding || !backend?.enabled) throw new Error('请先在当前 Agent 组中为此 Agent 配置已启用的 Backend 和模型');
      const output = await agentRuntime.runAgent({ agentId: value.id, groupId: group.id, agents: agents.map(a => a.id === value.id ? value : a), groups, backends,
        context, promptMode: true, jsonObject: story && value.id !== 'text_storyteller', mockMode: false, signal: controller.signal });
      setResult(output);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { running.current = null; setTesting(false); }
  };

  return <div className="space-y-4">
    <ConfigurationTarget disabled={saving || testing || status === '尚未保存'} />
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3"><button aria-label="返回 Agents" onClick={() => navigate('/agents')}><ArrowLeft className="w-4 h-4"/></button><h1 className="text-xl font-bold">{agent.name} · Prompt</h1></div>
      <button disabled={saving || testing || repository.busy} onClick={save} className="flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50"><Save className="w-4 h-4"/>{saving ? '保存中…' : repository.target === 'repository' ? '更新 Agent 草稿' : '保存 Agent'}</button>
    </header>
    {status && <p role="status" className="text-sm text-slate-500">{status}</p>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <fieldset disabled={saving || testing} className="space-y-4 min-w-0">
      <details className="rounded-xl border bg-white p-4" open={id === 'new' ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">基本信息</summary>
        <div className="grid sm:grid-cols-2 gap-4 mt-3">
          <label className="text-sm">名称<input aria-label="Agent 名称" className={field} value={agent.name} onChange={e => edit({ name: e.target.value })}/></label>
          <label className="text-sm">ID<input aria-label="Agent ID" className={field} disabled={id !== 'new'} value={agent.id} onChange={e => edit({ id: e.target.value })}/></label>
          <label className="text-sm sm:col-span-2">描述<textarea className={field} value={agent.description} onChange={e => edit({ description: e.target.value })}/></label>
        </div>
      </details>
      <section className="grid lg:grid-cols-[minmax(0,1fr)_250px] gap-4">
        <label className="text-sm font-semibold min-w-0">Prompt<textarea aria-label="Prompt" ref={promptInput} rows={22} className={`${field} mt-2 font-mono leading-relaxed resize-y`} value={agent.prompt || ''} onChange={e => edit({ prompt: e.target.value })}/></label>
        <aside className="space-y-2 pt-1"><h2 className="text-sm font-semibold">可用变量</h2><p className="text-xs text-slate-500">点击插入。可自由调整顺序、标签和数据格式；未引用的数据不会自动追加。</p>
          {Object.entries(variables).map(([name, description]) => <button type="button" key={name} onClick={() => insert(name)} className="block w-full text-left rounded-lg border bg-white p-2"><code className="text-xs text-blue-700">{'{{' + name + '}}'}</code><span className="block text-xs text-slate-500 mt-1">{description}</span></button>)}
          <p className="text-xs text-slate-500">对象与列表默认转为 JSON。支持 {'{{json material}}'} 和点路径，如 {'{{player.name}}'}；数组可用数字索引。仅能引用当前阶段实际提供的字段，不支持循环或执行代码。</p>
        </aside>
      </section>
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">生成参数{!legacyText && '与输出校验'}</summary>
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          {(['temperature', 'maxTokens', 'topP'] as const).map(key => <label key={key} className="text-sm">{{temperature:'Temperature', maxTokens:'Max Tokens（0 为无上限）', topP:'Top P'}[key]}<input aria-label={key} type="number" min={0} max={key === 'temperature' ? 2 : key === 'topP' ? 1 : undefined} step={key === 'maxTokens' ? 1 : 0.1} className={field} value={agent.defaults[key] ?? ''} onChange={e => edit({ defaults: { ...agent.defaults, [key]: e.target.value === '' ? undefined : Number(e.target.value) } })}/></label>)}
        </div>
        <label className="block text-sm mt-4">额外请求字段（JSON）<textarea aria-label="额外请求字段" rows={5} className={`${field} font-mono`} value={extraBody} onChange={e => { setExtraBody(e.target.value); setStatus('尚未保存'); setPreview(''); setResult(null); }}/></label>
        {!legacyText && <label className="block text-sm mt-4">输出 Schema（空白为纯文本）<textarea aria-label="输出 Schema" rows={8} className={`${field} font-mono`} value={schema} onChange={e => { setSchema(e.target.value); setStatus('尚未保存'); setPreview(''); setResult(null); }}/></label>}
      </details>
    </fieldset>
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium">预览与测试</summary>
      <p className="text-sm text-slate-500 my-3">样本变量用于测试，不修改本局数据。预览与游戏使用同一 Prompt 渲染器。{story && '人物选择、ID 引用和输出协议仍由游戏管线校验。'}</p>
      <label className="text-sm">样本变量 JSON<textarea aria-label="样本变量 JSON" disabled={testing} rows={12} className={`${field} font-mono mt-2`} value={contextText} onChange={e => { setContextText(e.target.value); setPreview(''); setResult(null); }}/></label>
      <div className="flex flex-wrap items-center gap-3 my-3 text-sm"><button disabled={testing} onClick={() => { setError(''); try { render(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } }} className="border rounded px-3 py-2">预览 Prompt</button>
        <button disabled={saving || testing || !binding || !backend?.enabled} onClick={test} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">{testing ? '测试中…' : '真实模型测试'}</button>
        {testing && <button onClick={() => running.current?.abort()}>取消测试</button>}
        <span className="text-slate-500">{group?.name || '未选择组'} · {backend?.name || '未配置 Backend'} · {binding?.model || '未绑定模型'}</span>
      </div>
      {preview && <pre aria-label="渲染后的 Prompt" className="whitespace-pre-wrap break-words text-sm rounded bg-slate-50 p-3">{preview}</pre>}
      {result && <div className="mt-4 space-y-2"><p role="status" className={result.success ? 'text-emerald-700' : 'text-rose-600'}>{result.success ? '测试成功' : '测试失败：' + result.error}</p><pre className="whitespace-pre-wrap text-sm">{typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}</pre><details><summary>完整结果 JSON</summary><JsonViewer data={result}/></details></div>}
    </details>
  </div>;
};
