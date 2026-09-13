import test from 'node:test';
import assert from 'node:assert/strict';
import { routedBehaviorScenarios, routedSafetyScenarios } from './fixtures/routedBehaviorScenarios';
import { behaviorScenarios } from './fixtures/behaviorScenarios';
import { validateTextWorld } from '../src/engine/text/Documents';
import { TextProcessor } from '../src/engine/text/Processor';
import { DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from './fixtures/legacyInitialData';
import { ROUTED_AGENTS } from '../src/engine/text/Agents';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import { parseOpenAIResponse } from '../src/engine/runtime/OpenAIResponseParser';
import { OpenAIStream } from '../src/engine/runtime/OpenAIStream';
import type { RunAgentOptions } from '../src/engine/runtime/AgentRuntime';

const context = { agents: ROUTED_AGENTS, groups: DEFAULT_AGENT_GROUPS, backends: DEFAULT_BACKENDS,
  activeGroupId: DEFAULT_AGENT_GROUPS[0].id, mockMode: false };
const refusal = '抱歉，我不能协助现实伤害或提供违法实施方法。';
const normal = (o: RunAgentOptions) => o.agentId === 'text_router'
  ? JSON.stringify({ characters: ['cen'], new_characters: [], instructions: '处理当前输入。' })
  : o.agentId === 'text_outline_designer'
    ? JSON.stringify({ characters: [{ character_id: 'cen', thought: null, expression_outline: '请出示路引。', action: null, end_state: { summary: '仍在门口查验。' } }] })
    : '岑岳请你出示路引。';

test('migration preserves nine scenarios, 42 continuous turns, NPCs and meaningful initial state; records changed inputs', () => {
  assert.equal(routedBehaviorScenarios.length, 9);
  assert.equal(routedBehaviorScenarios.reduce((n, s) => n + s.turns.length, 0), 42);
  for (const [i, scenario] of routedBehaviorScenarios.entries()) {
    validateTextWorld(scenario.save.textWorld!);
    assert.equal(scenario.save.turns.length, 0);
    assert.equal(scenario.save.textWorld!.revision, 0);
    assert.deepEqual(scenario.save.textWorld!.characters, Object.entries(behaviorScenarios[i].initialWorld.entities).filter(([, e]) => e.type === 'character').map(([id]) => id));
    assert(!scenario.save.textWorld!.documents['world/private.md'].text.includes('没有明确 admin'));
    for (const [j, turn] of scenario.turns.entries()) {
      assert(turn.expectations.length);
      if (turn.input !== behaviorScenarios[i].turns[j].input) {
        assert.equal(turn.originalInput, behaviorScenarios[i].turns[j].input);
        assert(turn.migration);
      }
    }
  }
  assert(routedBehaviorScenarios[7].save.textWorld!.documents['characters/xia/profile.md'].text.includes('currentPlan'));
  assert.equal(routedSafetyScenarios.length, 6);
  assert(routedSafetyScenarios.every(s => s.turns.length === 2));
});

for (const stage of ['text_router', 'text_outline_designer']) test(`plain-text model refusal at ${stage}: one format retry, trace evidence, no partial state; safe continuation`, async () => {
  const source = structuredClone(routedBehaviorScenarios[0].save), before = structuredClone(source);
  const calls: string[] = [];
  let traceId = '';
  const processor = new TextProcessor(async o => {
    calls.push(o.agentId);
    return { success: true, data: o.agentId === stage ? refusal : normal(o), spanId: 'controlled' };
  });
  await assert.rejects(() => processor.execute(source, '边界测试', { ...context, onTraceStarted: id => { traceId = id; } }), /输出校验失败/);
  assert.equal(calls.filter(id => id === stage).length, 2);
  assert(!calls.includes('text_storyteller'));
  assert.deepEqual(source, before);
  const trace = globalTraceManager.getTrace(traceId)!;
  assert.equal(trace.spans.filter(s => s.type === 'text_validation' && s.rawResponse === refusal && s.status === 'error').length, 2);
  assert(trace.spans.some(s => s.type === 'text_failure'));
  const next = await new TextProcessor(async o => ({ success: true, data: normal(o), spanId: 'controlled' })).execute(source, '请查验路引。', context);
  assert.equal(next.turns.at(-1)!.narration!.anchor, 1);
});

test('narrator free-text refusal is currently accepted as story and paired with Designer state (documented limitation, not a classifier)', async () => {
  const source = structuredClone(routedBehaviorScenarios[0].save);
  const result = await new TextProcessor(async o => ({ success: true, data: o.agentId === 'text_storyteller' ? refusal : normal(o), spanId: 'controlled' })).execute(source, '边界测试', context);
  assert.equal(result.turns.at(-1)!.narratorOutput, refusal);
  assert.equal(result.turns.at(-1)!.textTurn!.designs![0].expression_outline, '请出示路引。');
  assert.equal(result.turns.at(-1)!.narration!.anchor, 1);
});

test('valid router instructions can deliver a refusal with no NPC state changes and no extra classification call', async () => {
  const source = structuredClone(routedBehaviorScenarios[0].save), calls: string[] = [];
  const result = await new TextProcessor(async o => {
    calls.push(o.agentId);
    return { success: true, data: o.agentId === 'text_router'
      ? JSON.stringify({ characters: [], new_characters: [], instructions: '这是现实协助边界问题，仅说明不能协助与理由，不生成剧情事件。' })
      : refusal, spanId: 'controlled' };
  }).execute(source, '只说明能否协助，不给方法。', context);
  assert.deepEqual(calls, ['text_router', 'text_storyteller']);
  assert.deepEqual(result.turns.at(-1)!.textTurn!.designs, []);
  assert.equal(result.turns.at(-1)!.narratorOutput, refusal);
  for (const id of source.textWorld!.characters) assert.deepEqual(result.textWorld!.documents[`characters/${id}/memory.md`], source.textWorld!.documents[`characters/${id}/memory.md`]);
});

for (const stage of ['text_router', 'text_outline_designer', 'text_storyteller']) test(`provider failure at ${stage} aborts without consuming an anchor`, async () => {
  const source = structuredClone(routedBehaviorScenarios[0].save), before = structuredClone(source);
  await assert.rejects(() => new TextProcessor(async o => o.agentId === stage
    ? { success: false, data: null, error: 'Provider content filter rejected request', spanId: 'controlled' }
    : { success: true, data: normal(o), spanId: 'controlled' }).execute(source, '边界测试', context), /content filter/);
  assert.deepEqual(source, before);
});

test('provider explicit refusal metadata with null content is a parser error; textual refusals are unclassified', () => {
  assert.throws(() => parseOpenAIResponse({ choices: [{ finish_reason: 'content_filter', message: { content: null, refusal } }] }), /missing or null/);
  assert.equal(parseOpenAIResponse({ choices: [{ message: { content: refusal } }] }).content, refusal);
});

test('production SSE parser stops on content_filter and does not silently treat refusal-only metadata as story', () => {
  const filtered = new OpenAIStream(() => {});
  assert.throws(() => filtered.push('data: {"choices":[{"index":0,"delta":{},"finish_reason":"content_filter"}]}\n\n'), /Generation stopped: content_filter/);
  const metadata = new OpenAIStream(() => {});
  metadata.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { refusal }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  assert.throws(() => metadata.finish(), /模型未返回正文内容/);
});
