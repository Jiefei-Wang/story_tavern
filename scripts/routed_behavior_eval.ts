import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { routedBehaviorScenarios, routedSafetyScenarios } from '../tests/fixtures/routedBehaviorScenarios';
import { TextProcessor } from '../src/engine/text/Processor';
import { ROUTED_AGENTS, addTextBindings } from '../src/engine/text/Agents';
import { StorageService } from '../src/db/storage';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import type { AgentDefinition, AgentGroup, Backend } from '../src/types';

const flag = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const output = path.resolve(flag('output') || 'artifacts/routed-behavior/first-run');
if (fs.existsSync(path.join(output, 'report.json'))) throw new Error('报告已存在；请使用新的 --output，避免覆盖首次失败证据');
fs.mkdirSync(output, { recursive: true });
try {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}
const secrets = Object.entries(process.env).filter(([k, v]) => /key|secret|token|password/i.test(k) && v).map(([, v]) => v!);
const clean = (value: unknown) => {
  let text = JSON.stringify(value, null, 2);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text;
};
const report: any = { status: 'starting', pipeline: 'routed-v2', startedAt: new Date().toISOString(),
  evaluation: 'Real configured models, unchanged production pipeline. Manual semantic/refusal review; no classifier or judge model.', scenarios: [] };
const persist = () => fs.writeFileSync(path.join(output, 'report.json'), clean(report));
const maximumCalls = Number(flag('calls') || 240);
if (!Number.isInteger(maximumCalls) || maximumCalls < 1 || maximumCalls > 500) throw new Error('calls must be 1..500');
try {
  let config: { agents: AgentDefinition[]; groups: AgentGroup[]; backends: Backend[] };
  if (flag('config')) config = JSON.parse(fs.readFileSync(flag('config')!, 'utf8'));
  else {
    const db = new DatabaseSync(path.join(process.env.APPDATA || '', 'story_tavern', 'story_tavern.db'), { readOnly: true });
    const list = (table: string) => (db.prepare(`SELECT data FROM ${table} ORDER BY updated_at DESC`).all() as any[]).map(row => JSON.parse(row.data));
    try { config = { agents: list('agents'), groups: list('agent_groups'), backends: list('backends') }; }
    finally { db.close(); }
  }
  const source = config.groups.find(g => g.id === (flag('group') || 'group_fast'));
  if (!source) throw new Error('没有指定的已有模型组');
  const group = { ...addTextBindings(structuredClone(source)), id: 'routed_behavior_unit_test', name: 'unit test' };
  const agents = [...config.agents];
  for (const agent of ROUTED_AGENTS) if (!agents.some(a => a.id === agent.id)) agents.push(agent);
  for (const agent of ROUTED_AGENTS) {
    const binding = group.bindings.find(b => b.agentId === agent.id);
    const backend = config.backends.find(b => b.id === binding?.backendId);
    if (!binding || !backend?.enabled) throw new Error(`缺少 ${agent.id} 可用绑定`);
    if (backend.authType === 'bearer' && !['backend_openrouter', 'secret_openrouter_default'].includes(backend.secretRef || '')) throw new Error('Node 无法读取此 OS Keyring 凭证');
    if (backend.authType === 'bearer' && !process.env.OPENROUTER_KEY && !process.env.openrouter_key) throw new Error('无可用测试凭证');
  }
  report.sourceGroupId = source.id;
  report.groupId = group.id;
  report.bindings = group.bindings.filter(b => ROUTED_AGENTS.some(a => a.id === b.agentId));
  report.agents = agents.filter(a => ROUTED_AGENTS.some(r => r.id === a.id));
  report.runtimeSources = Object.fromEntries(['src/engine/text/Processor.ts', 'src/engine/text/Agents.ts', 'src/engine/text/History.ts', 'src/engine/text/RoutedProtocol.ts', 'src/engine/runtime/AgentRuntime.ts', 'tests/fixtures/routedBehaviorScenarios.ts', 'scripts/routed_behavior_eval.ts'].map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  const storage = new StorageService();
  const { agentRuntime } = await import('../src/engine/runtime/AgentRuntime');
  let calls = 0;
  const processor = new TextProcessor(async options => {
    if (++calls > maximumCalls) throw new Error('测试调用预算耗尽');
    return agentRuntime.runAgent(options);
  });
  const suite = [...routedBehaviorScenarios, ...routedSafetyScenarios].filter(s => !flag('scenario') || s.id === flag('scenario'));
  if (!suite.length) throw new Error('未知 scenario');
  report.status = 'running';
  persist();
  for (const scenario of suite) {
    let save = structuredClone(scenario.save);
    save.activeAgentGroupId = group.id;
    await storage.commitTextGame(save, null);
    const result: any = { id: scenario.id, title: scenario.title, kind: scenario.kind, initialWorld: save.textWorld, turns: [] };
    report.scenarios.push(result);
    for (const [index, item] of scenario.turns.entries()) {
      if (calls >= maximumCalls) throw new Error('测试调用预算耗尽');
      console.log(`${scenario.id} ${index + 1}/${scenario.turns.length} start`);
      const before = structuredClone(save), start = Date.now(), callStart = calls;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000);
      let traceId = '';
      const entry: any = { index: index + 1, ...item, beforeRevision: save.textWorld!.revision, review: 'pending' };
      try {
        const candidate = await processor.execute(save, item.input, { agents, groups: [group], backends: config.backends,
          activeGroupId: group.id, mockMode: false, signal: controller.signal, onTraceStarted: id => { traceId = id; } });
        await storage.commitTextGame(candidate, save.textWorld!.revision);
        for (const span of globalTraceManager.getTrace(traceId)?.spans || []) if (span.type === 'text_commit')
          globalTraceManager.updateSpan(traceId, span.id, { parsedOutput: { ...(span.parsedOutput as object), committed: true } });
        globalTraceManager.endTurnTrace(traceId, 'success');
        save = candidate;
        const turn = save.turns.at(-1)!;
        Object.assign(entry, { status: 'committed', routing: turn.textTurn?.instructions, designs: turn.textTurn?.designs,
          createdCharacters: turn.textTurn?.createdCharacters, narration: turn.narratorOutput, anchor: turn.narration?.anchor,
          checks: { pipeline: turn.textTurn?.pipeline === 'routed-v2', anchor: turn.narration?.anchor === before.turns.length + 1,
            hiddenAnchor: !/【时间点\s*\d+】/.test(turn.narratorOutput), revision: save.textWorld!.revision === before.textWorld!.revision + 1 } });
      } catch (error) {
        Object.assign(entry, { status: 'failed', error: String(error), checks: { inputSaveUnchanged: JSON.stringify(before) === JSON.stringify(save),
          persistedSaveUnchanged: JSON.stringify(JSON.parse(values.get('story_tavern_saves') || '[]').find((s: any) => s.id === save.id)) === JSON.stringify(before) } });
        // The next input uses the actual last committed state, never a fabricated fix.
      } finally {
        clearTimeout(timer);
        const trace = globalTraceManager.getTrace(traceId);
        Object.assign(entry, { elapsedMs: Date.now() - start, calls: calls - callStart, tokens: trace?.totalTokens,
          formatRetries: trace?.spans.filter(s => s.type === 'text_validation' && (s.inputContext as any)?.attempt === 2).length || 0,
          traceFile: `${scenario.id}-${index + 1}.trace.json` });
        fs.writeFileSync(path.join(output, entry.traceFile), clean(trace || { error: 'No trace created' }));
        result.turns.push(entry);
        result.finalSave = save;
        report.totalCalls = calls;
        persist();
        console.log(`${scenario.id} ${index + 1} ${entry.status}; calls=${calls}`);
      }
    }
  }
  report.status = 'execution-complete-review-pending';
  report.endedAt = new Date().toISOString();
  persist();
} catch (error) {
  report.status = 'interrupted'; report.error = String(error); persist();
  console.error(clean({ error: report.error })); process.exitCode = 1;
}
