import { z } from 'zod';
import type { AgentDefinition, AgentGroup, Backend } from '../../types';
import { agentRuntime, type RunAgentOptions, type RunAgentResult } from '../runtime/AgentRuntime';
import { SchemaValidator } from '../schema/SchemaValidator';
import { globalTraceManager } from '../tracing/TraceManager';

const safe = (s: string) => !['__proto__', 'prototype', 'constructor'].includes(s);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/).refine(safe);
const pointer = z.string().refine(s => (s === '' || s.startsWith('/')) && !/~(?![01])/.test(s) && s.split('/').every(p => safe(p.replace(/~1/g, '/').replace(/~0/g, '~'))), '无效 JSON Pointer');
export const sourceSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('input') }).passthrough(),
  z.object({ from: z.literal('step'), stepId: id, pointer }).passthrough(),
  z.object({ from: z.literal('context'), pointer }).passthrough(),
]);
export const workflowSchema = z.object({ id, name: z.string().trim().min(1), steps: z.array(z.object({
  id, agentId: id, inputs: z.record(id, sourceSchema), storyStage: z.enum(['route', 'cards', 'outlines', 'narration']).optional(),
}).passthrough()).min(1).max(32), output: sourceSchema }).passthrough();
export const workflowsSchema = z.record(id, workflowSchema);
export type Workflow = z.infer<typeof workflowSchema>;
type Source = z.infer<typeof sourceSchema>;
export type WorkflowStep = Workflow['steps'][number];
export const DEFAULT_STORY_WORKFLOW: Workflow = {
  id: 'default_story', name: '默认故事组合',
  steps: [
    { id: 'route', agentId: 'text_router', storyStage: 'route', inputs: {} },
    { id: 'cards', agentId: 'text_character_designer', storyStage: 'cards', inputs: {} },
    { id: 'outlines', agentId: 'text_outline_designer', storyStage: 'outlines', inputs: {} },
    { id: 'narration', agentId: 'text_storyteller', storyStage: 'narration', inputs: {} },
  ], output: { from: 'step', stepId: 'narration', pointer: '' },
};

export interface PreparedStep {
  context: Record<string, unknown>;
  skip?: boolean;
  jsonObject?: boolean;
  validate?: (data: unknown) => unknown;
  accept?: (data: any) => void;
}
export interface WorkflowOptions {
  agents: AgentDefinition[]; groups: AgentGroup[]; backends: Backend[]; groupId: string; signal?: AbortSignal;
  context?: Record<string, unknown>;
  traceId?: string;
  onTraceStarted?: (traceId: string) => void;
  /** The game owns the final transaction and closes its trace after saving. */
  finishTrace?: boolean;
  prepareStep?: (step: WorkflowStep) => PreparedStep;
}

export function validateWorkflow(value: unknown, agents?: AgentDefinition[]): asserts value is Workflow {
  workflowSchema.parse(value);
  const flow = value as Workflow, seen = new Set<string>();
  const stages = flow.steps.filter(s => s.storyStage).map(s => s.storyStage);
  if (stages.length && stages.join(',') !== 'route,cards,outlines,narration') throw new Error('故事阶段必须依次为 route、cards、outlines、narration，且各出现一次');
  const check = (source: Source) => { if (source.from === 'step' && !seen.has(source.stepId)) throw new Error(`步骤引用不存在或尚未执行：${source.stepId}`); };
  for (const step of flow.steps) {
    if (seen.has(step.id)) throw new Error(`步骤 ID 重复：${step.id}`);
    Object.values(step.inputs).forEach(check);
    if (agents) {
      const agent = agents.find(a => a.id === step.agentId);
      if (!agent) throw new Error(`Agent 不存在：${step.agentId}`);
      for (const field of agent.inputs) if (!step.storyStage && field.required && !has(step.inputs, field.name)) throw new Error(`${step.id} 缺少输入：${field.name}`);
    }
    seen.add(step.id);
  }
  check(flow.output);
}

export function validateWorkflows(value: unknown, agents?: AgentDefinition[]) {
  workflowsSchema.parse(value);
  for (const [key, flow] of Object.entries(value as Record<string, Workflow>)) {
    if (key !== flow.id) throw new Error('流程 ID 与集合键必须一致');
    validateWorkflow(flow, agents);
  }
}

function resolve(source: Source, input: string, results: Map<string, unknown>, context: Record<string, unknown>): unknown {
  if (source.from === 'input') return input;
  let value: unknown = source.from === 'context' ? context : results.get(source.stepId);
  for (const token of source.pointer === '' ? [] : source.pointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || typeof value !== 'object' || !has(value, key)) throw new Error(`输出字段不存在：${source.from === 'context' ? 'context' : source.stepId}${source.pointer}`);
    value = (value as Record<string, unknown>)[key];
  }
  return structuredClone(value);
}

export async function runWorkflow(flow: Workflow, input: string, options: WorkflowOptions, runner: (options: RunAgentOptions) => Promise<RunAgentResult> = options => agentRuntime.runAgent(options)): Promise<string> {
  // Snapshot definitions and bindings so edits cannot change an in-flight run.
  flow = structuredClone(flow);
  const { signal } = options;
  const config = structuredClone({ agents: options.agents, groups: options.groups, backends: options.backends, groupId: options.groupId });
  signal?.throwIfAborted();
  validateWorkflow(flow, config.agents);
  if (flow.steps.some(s => s.storyStage) && !options.prepareStep) throw new Error('故事阶段需要存档上下文，请在游戏中运行');
  if (!input.trim()) throw new Error('请输入内容');
  const group = config.groups.find(g => g.id === config.groupId);
  for (const step of flow.steps) {
    const binding = group?.bindings.find(b => b.agentId === step.agentId);
    if (!binding?.model.trim() || !config.backends.some(b => b.id === binding.backendId && b.enabled)) throw new Error(`${step.id} 缺少有效模型绑定`);
  }
  const traceId = options.traceId || `workflow_${crypto.randomUUID()}`, results = new Map<string, unknown>();
  const scope = structuredClone(options.context || {});
  globalTraceManager.startTurnTrace(traceId, 0, input);
  options.onTraceStarted?.(traceId);
  try {
    for (const step of flow.steps) {
      signal?.throwIfAborted();
      const prepared = step.storyStage ? options.prepareStep!(step) : undefined;
      if (prepared?.skip) { results.set(step.id, []); continue; }
      const context = { ...prepared?.context, ...Object.fromEntries(Object.entries(step.inputs).map(([key, source]) => [key, resolve(source, input, results, scope)])) };
      const agent = config.agents.find(a => a.id === step.agentId)!;
      for (const field of agent.inputs) {
        if (!has(context, field.name) && !field.required) continue;
        if (!['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'].includes(field.type)) throw new Error(`不支持的输入类型：${field.type}`);
        const check = SchemaValidator.validate({ type: field.type }, context[field.name]);
        if (!check.valid) throw new Error(`${step.id}.${field.name}：${check.errors}`);
      }
      let retry = '';
      for (let attempt = 0; attempt < (prepared?.jsonObject ? 2 : 1); attempt++) {
        const result = await runner({ ...config, agentId: step.agentId, context: { ...context, ...(prepared ? { retry } : {}) }, signal, traceId, blockId: step.id, protocol: 'definition', promptMode: true, jsonObject: prepared?.jsonObject, mockMode: false });
        signal?.throwIfAborted();
        if (!result.success) throw new Error(`步骤 ${step.id} 失败，请查看调试记录`);
        const spanId = `validation_${crypto.randomUUID()}`;
        globalTraceManager.createSpan(traceId, spanId, `${step.id} · 输出校验 ${attempt + 1}`, 'text_validation', result.spanId);
        globalTraceManager.updateSpan(traceId, spanId, { rawResponse: typeof result.data === 'string' ? result.data : JSON.stringify(result.data), inputContext: { stepId: step.id, attempt: attempt + 1 } });
        let data: unknown;
        try {
          if (agent.outputSchema) {
            const check = SchemaValidator.validate(agent.outputSchema, result.data);
            if (!check.valid) throw new Error(`${step.id} 输出不符合 schema`);
          }
          data = prepared?.validate ? prepared.validate(result.data) : result.data;
          globalTraceManager.updateSpan(traceId, spanId, { status: 'success', parsedOutput: data });
        } catch (error) {
          retry = error instanceof Error ? error.message : '输出无效';
          globalTraceManager.updateSpan(traceId, spanId, { status: 'error', error: retry, parsedOutput: { retryScheduled: !!prepared?.jsonObject && attempt === 0, committed: false } });
          if (!prepared?.jsonObject || attempt === 1) throw new Error(`输出校验失败：${retry}`);
          continue;
        }
        prepared?.accept?.(data);
        results.set(step.id, data);
        break;
      }
    }
    const output = resolve(flow.output, input, results, scope);
    if (typeof output !== 'string' || !output.trim()) throw new Error('最终输出必须是非空文本，请选择文本字段');
    if (options.finishTrace !== false) globalTraceManager.endTurnTrace(traceId, 'success');
    return output;
  } catch (error) {
    if (!signal?.aborted) {
      const span = `failure_${crypto.randomUUID()}`;
      globalTraceManager.createSpan(traceId, span, '组合失败 · 未提交保存', 'text_failure');
      globalTraceManager.updateSpan(traceId, span, { status: 'error', error: error instanceof Error ? error.message : String(error), parsedOutput: { committed: false } });
    }
    globalTraceManager.endTurnTrace(traceId, signal?.aborted ? 'cancelled' : 'error');
    throw error;
  }
}
