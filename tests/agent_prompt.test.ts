import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgentPrompt, renderAgentPrompt, validateAgentPrompt, samplePromptContext } from '../src/engine/template/AgentPrompt';
import { ROUTED_AGENTS } from '../src/engine/text/Agents';
import { AgentRuntime } from '../src/engine/runtime/AgentRuntime';
import { TextProcessor } from '../src/engine/text/Processor';
import { defaultLibrary, createStorySave } from '../src/engine/library/Library';

const router = ROUTED_AGENTS.find(a => a.id === 'text_router')!;

test('complete Prompt controls data layout, nested fields and omissions without mutating legacy configuration', () => {
  const source = { ...structuredClone(router), future: { keep: true } }, before = structuredClone(source);
  const context = samplePromptContext(router);
  assert(getAgentPrompt(source).includes('{{history}}'));
  const prompt = '<name>{{player.name}}</name>\n<input>{{input}}</input>\n<card>{{material.cards.0.profile}}</card>';
  assert.equal(renderAgentPrompt({ ...source, prompt }, context), '<name>旅人</name>\n<input>你好</input>\n<card>准备乘船离开。</card>');
  assert(!renderAgentPrompt({ ...source, prompt }, context).includes('世界定义'));
  assert.deepEqual(source, before);
  assert.equal(renderAgentPrompt({ ...source, prompt: '{{input}}' }, { input: '{{world}}' }), '{{world}}');
  assert.equal(renderAgentPrompt({ ...source, prompt: '{{json material}}' }, { material: { name: '艾琳' } }), '{\n  "name": "艾琳"\n}');
});

test('unavailable, inherited, unsafe and empty Prompt variables fail explicitly', () => {
  for (const prompt of ['{{secretRef}}', '{{world.constructor}}', '{{material.cards[0]}}', '{{input + 1}}', '{{input', ' ']) assert.throws(() => validateAgentPrompt({ ...router, prompt }));
  assert.throws(() => renderAgentPrompt({ ...router, prompt: '{{material.cards.3.name}}' }, samplePromptContext(router)), /缺少 Prompt 变量/);
  assert.throws(() => renderAgentPrompt({ ...router, prompt: '{{material.toString}}' }, { material: {} }), /缺少 Prompt 变量/);
  assert.throws(() => renderAgentPrompt({ ...router, prompt: '{{input}}' }, Object.create({ input: 'inherited' })), /缺少 Prompt 变量/);
});

test('story requests send exactly the same rendered Prompt as preview; retry feedback stays a variable', async t => {
  const library = defaultLibrary(), save = createStorySave(library, library.selectedStoryId!, 'test');
  const agents = ROUTED_AGENTS.map(a => ({ ...a, prompt: `ROLE=${a.id}\n<W>{{world}}</W>\n<P>{{player.name}}</P>\n<H>{{history}}</H>\n<I>{{input}}</I>\n<M>{{material}}</M>\n<R>{{retry}}</R>` }));
  const groups = [{ id: 'test', name: 'test', bindings: agents.map(a => ({ agentId: a.id, backendId: 'test', model: 'model' })) }];
  const backends = [{ id: 'test', name: 'test', baseUrl: 'http://example.test/v1', authType: 'none' as const, customHeaders: {}, enabled: true, timeoutMs: 1000, maxConcurrency: 1 }];
  const runtime = new AgentRuntime();
  let expected = '', routerCalls = 0, count = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
    const request = JSON.parse(options.body);
    assert.deepEqual(request.messages, [{ role: 'user', content: expected }]);
    count++;
    const data = expected.startsWith('ROLE=text_router') ? ++routerCalls === 1 ? '{}' : JSON.stringify({ characters: [], new_characters: [], instructions: '保持原样。' }) : '你走进酒馆。';
    return new Response(JSON.stringify({ choices: [{ message: { content: data } }] }), { headers: { 'content-type': 'application/json' } });
  });
  await new TextProcessor(options => {
    const agent = agents.find(a => a.id === options.agentId)!;
    expected = renderAgentPrompt(agent, options.context);
    if (routerCalls === 1 && options.agentId === 'text_router') assert(options.context.retry.length > 0);
    assert.equal(options.conversation, undefined);
    return runtime.runAgent(options);
  }).execute(save, '你好 {{world}}', { agents, groups, backends, activeGroupId: 'test', mockMode: false });
  assert.equal(count, 3);
  const result = await runtime.runAgent({ agentId: router.id, agents: [{ ...router, prompt: '{{material.missing}}' }], groups, backends, groupId: 'test', context: { material: {} }, promptMode: true });
  assert.equal(result.success, false);
  assert.match(result.error!, /缺少 Prompt 变量/);
  assert.equal(count, 3, 'missing variables must not send a request');
});
