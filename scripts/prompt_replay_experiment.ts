/** Offline request replay only: never writes production agents, groups or source files. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { agentRuntime } from '../src/engine/runtime/AgentRuntime';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import { redactEvidence, requireUnitTestGroup } from '../src/engine/evaluation/BehaviorEvaluation';
import { renderMessages } from '../src/engine/template/PlaceholderEngine';
import { withCharacterContract } from '../src/engine/character-schema/AgentContract';
import { withConversationContract } from '../src/engine/runtime/ConversationContracts';
import { withInputAuthorityContract } from '../src/engine/runtime/InputAuthority';
import type { AgentDefinition } from '../src/types';

const option = (key: string, fallback: string) => process.argv.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
for (const arg of process.argv.slice(2)) if (!/^--(?:directory|config|mode|repetitions|arms|summary|input|model)=.+$/.test(arg)) throw Error('Unsupported experiment argument');
const directory = path.resolve(option('directory', 'artifacts/prompt-experiments/v1'));
const mode = option('mode', 'prepare');
assert(['prepare', 'run'].includes(mode));
const repetitions = Number(option('repetitions', '3'));
assert(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 5);
const arms = option('arms', 'baseline,candidate').split(',');
assert(arms.length > 0 && new Set(arms).size === arms.length && arms.every(arm => ['baseline', 'candidate'].includes(arm)));
const summary = option('summary', 'none');
assert(['none', 'except_compiler'].includes(summary));
const inputMode = option('input', 'original');
assert(['original', 'compact', 'clean_evidence'].includes(inputMode));
const modelOverride = option('model', '');
if (modelOverride) assert(inputMode === 'original' && summary === 'none' && arms.length === 1 && arms[0] === 'baseline', 'Model-only comparisons must preserve the original request');

function compactNarrationInput(context: any) {
  const events = (context.committedEvents || []).map((event: any) => {
    const { source, speechPlan, outcome, ...rest } = event;
    // Preserve every nonduplicate source field and every conflicting value. No semantic repair.
    const sourceOnly = source && typeof source === 'object' ? Object.fromEntries(Object.entries(source).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(event[key]))) : source;
    return { ...rest, ...(sourceOnly && Object.keys(sourceOnly).length ? { originalAttemptOrSource: sourceOnly } : {}),
      ...(outcome ? { actualOutcome: outcome } : {}), ...(speechPlan ? { intendedSpeechMeaning: speechPlan } : {}) };
  });
  return { '当前场景（回合结束）': context.scene, '当前实体（名称不代表当前归属，以location为准）': context.entities,
    '本轮实际公开状态变化': context.publicPatches, '按发生顺序的事件（originalAttemptOrSource是尝试或来源，actualOutcome是结果）': events,
    ...(context.narration ? { '待审输出（不是事实来源）': context.narration } : {}) };
}
const configPath = path.resolve(option('config', 'artifacts/behavior-tests/unit-test-config.fixed.json'));
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const configText = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configText);
const group = requireUnitTestGroup(config);
const sourceFingerprint = () => {
  const files = fs.readdirSync('src', { recursive: true }).map(String).filter(x => /\.(?:ts|tsx)$/.test(x)).sort();
  return hash(files.map(file => `${file.replaceAll('\\', '/')}\n${fs.readFileSync(path.join('src', file), 'utf8')}`).join('\n'));
};
const productionBefore = sourceFingerprint();
const cases = JSON.parse(fs.readFileSync(path.join(directory, 'cases.json'), 'utf8'));
const prompts = { ...JSON.parse(fs.readFileSync(path.join(directory, 'narration-prompts.json'), 'utf8')), ...JSON.parse(fs.readFileSync(path.join(directory, 'reasoning-prompts.json'), 'utf8')) };
assert(Array.isArray(cases) && cases.length > 0);
const seen = new Set<string>();
const requests = cases.map((sample: any) => {
  assert(!seen.has(sample.id)); seen.add(sample.id);
  const raw = fs.readFileSync(sample.sourceFile, 'utf8');
  const original = JSON.parse(raw);
  const turn = original.turns.find((t: any) => t.turnNumber === sample.turnNumber);
  const span = turn.trace.spans.filter((s: any) => s.agentId === sample.role)[sample.spanIndex];
  assert(span?.resolvedMessages?.length && span?.requestParams);
  assert(typeof prompts[sample.role] === 'string' && prompts[sample.role].length > 50);
  const binding = group.bindings.find((b: any) => b.agentId === sample.role)!;
  assert(binding && binding.model === span.requestParams.model && binding.backendId === span.backendId);
  if (modelOverride) assert(config.backends.find((b: any) => b.id === binding.backendId)?.models?.includes(modelOverride), 'Requested model must be in the configured backend catalog');
  const savedDefinition = config.agents.find((a: any) => a.id === sample.role)!;
  const definition = withInputAuthorityContract(withCharacterContract(withConversationContract(savedDefinition), span.inputContext?.characterSchema), span.inputContext?.player?.input);
  assert(definition?.outputSchema);
  const baseline = span.resolvedMessages.map((m: any) => ({ role: m.role, content: m.content }));
  if (inputMode !== 'original') assert(['narrator', 'narration_auditor'].includes(sample.role));
  let candidate = [{ role: 'system', content: prompts[sample.role] }, ...(inputMode === 'compact'
    ? [{ role: 'user', content: '以下是同一请求的公开资料。请完成你的角色任务。\n' + JSON.stringify(compactNarrationInput(span.inputContext), null, 2) }]
    : baseline.filter((m: any) => m.role !== 'system'))];
  if (inputMode === 'clean_evidence') {
    const events = span.inputContext.committedEvents;
    const cleanEvents = events.map(({ realizedText: _draft, ...event }: any) => event);
    const originalJSON = JSON.stringify(events, null, 2);
    const cleanJSON = JSON.stringify(cleanEvents, null, 2);
    assert(baseline.some((m: any) => m.role === 'user' && m.content.includes(originalJSON)));
    candidate = baseline.map((m: any) => ({ ...m, content: m.role === 'user' ? m.content.replace(originalJSON, cleanJSON) : m.content }));
  }
  // Semantic gold, reviewer notes and original outputs are intentionally absent from requests.
  return { sample, sourceSha256: hash(raw), originalSpanId: span.id, originalOutput: span.parsedOutput,
    originalParams: span.requestParams, replayParams: { ...span.requestParams, ...(modelOverride ? { model: modelOverride } : {}) }, definition, binding, baseline, candidate };
});
const manifest: any = { mode: 'paired_original_request_replay', productionSourceSHA256: productionBefore,
  configSHA256: hash(configText), repetitions, arms, evidenceSummaryEnvelope: summary, inputMode, modelOverride: modelOverride || null,
  protocol: modelOverride
    ? 'Model-only comparison: original baseline messages and parameters are replayed, replacing only the requested model ID. Original schema, input facts, temperature, top_p, token budget and reasoning_effort are preserved. One call per attempt, manual review separate. Production config unchanged.'
    : summary === 'none'
    ? 'Same original user messages, output schema, model, temperature and reasoning_effort. Replace ALL system messages only. Each request gets one attempt; no formatting retries or gameplay execution. Manual semantic review is separate.'
    : 'Same original user messages, model and generation parameters. Candidate except compiler adds a short evidenceSummary then answer envelope; answer retains the common output schema. This tests an explicit short evidence summary, not just a system-only change. One request attempt, manual semantics separate; prior baseline retained in v1.',
  cases: requests.map(({ sample, sourceSha256, originalSpanId, originalParams, replayParams, definition, baseline, candidate }: any) => ({ ...sample, sourceSha256, originalSpanId, originalParams, replayParams, commonOutputSchemaSHA256: hash(JSON.stringify(definition.outputSchema)), requests: { baseline, candidate }, requestHashes: { baseline: hash(JSON.stringify(baseline)), candidate: hash(JSON.stringify(candidate)) } })) };
fs.mkdirSync(directory, { recursive: true });
const manifestPath = path.join(directory, 'manifest.json');
if (fs.existsSync(manifestPath)) assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifest, 'Frozen experiment changed');
else fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
if (mode === 'prepare') {
  console.log(`Prepared ${requests.length} cases x ${repetitions} repeats x ${arms.length} arms; production sources unchanged.`);
  process.exit(0);
}
try {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch (error: any) { if (error.code !== 'ENOENT') throw error; }
const secrets = Object.entries(process.env).filter(([key, value]) => /key|secret|token|password|credential/i.test(key) && value).map(([, value]) => value!);
const clean = (value: any) => redactEvidence(value, secrets);
const outputDir = path.join(directory, 'responses');
fs.mkdirSync(outputDir, { recursive: true });
const jobs = Array.from({ length: repetitions }, (_, repeat) => requests.flatMap((request: any, caseIndex: number) => {
  const orderedArms = (repeat + caseIndex) % 2 ? [...arms].reverse() : arms;
  return orderedArms.map(arm => ({ request, repeat: repeat + 1, arm }));
})).flat();
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { request, repeat, arm } = jobs[next++];
    const file = path.join(outputDir, `${request.sample.id}.${arm}.${repeat}.json`);
    if (fs.existsSync(file)) throw Error(`Refusing to overwrite ${file}`);
    const messages = request[arm];
    const alias = `experiment_${request.sample.role}`;
    const params = request.replayParams;
    const context = Object.fromEntries(messages.map((m: any, index: number) => [`message${index}`, m.content]));
    const { model: _model, temperature, top_p, max_tokens, reasoning_effort, ...extraBody } = params;
    const useSummary = arm === 'candidate' && summary === 'except_compiler' && request.sample.role !== 'input_compiler';
    const definition: AgentDefinition = { ...structuredClone(request.definition), id: alias,
      messages: messages.map((m: any, index: number) => ({ id: `m${index}`, role: m.role, content: `{{text message${index}}}` })),
      inputs: Object.keys(context).map(name => ({ name, type: 'string', required: true })),
      defaults: { temperature, topP: top_p, maxTokens: max_tokens || 0, extraBody } };
    if (useSummary) definition.outputSchema = { type: 'object', additionalProperties: false,
      required: ['evidenceSummary', 'answer'], properties: {
        evidenceSummary: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 180 } },
        answer: definition.outputSchema } };
    assert.deepEqual(renderMessages(definition.messages, context), messages, 'Replay must preserve exact message bytes');
    const replayGroup = { ...structuredClone(group), bindings: [{ ...structuredClone(request.binding), model: params.model, agentId: alias,
      overrides: { temperature, topP: top_p, maxTokens: max_tokens || 0, reasoningEffort: reasoning_effort, extraBody } }] };
    const traceId = `prompt_experiment_${randomUUID()}`;
    const startedAt = new Date().toISOString();
    console.log(`${request.sample.id} ${arm} ${repeat}/${repetitions} starting`);
    let result: any;
    try {
      result = await agentRuntime.runAgent({ agentId: alias, groupId: group.id, context,
        agents: [definition], groups: [replayGroup], backends: config.backends,
        traceId, formatRetryAttempt: 1, mockMode: false });
    } catch (error: any) { result = { success: false, error: error.message || String(error) }; }
    const trace = globalTraceManager.getTrace(traceId);
    const actualSpan = trace?.spans.find(s => s.agentId === alias);
    if (actualSpan?.requestParams) assert.deepEqual(actualSpan.requestParams, params, 'Request parameters changed');
    const rawEnvelope = useSummary && result.success ? result.data : undefined;
    if (rawEnvelope) result = { ...result, data: rawEnvelope.answer, evidenceSummary: rawEnvelope.evidenceSummary };
    const output = { caseId: request.sample.id, role: request.sample.role, arm, repeat, startedAt,
      completedAt: new Date().toISOString(), sourceSha256: request.sourceSha256,
      messagesSHA256: hash(JSON.stringify(messages)), result, ...(rawEnvelope ? { rawEnvelope } : {}), trace, manualReview: 'pending' };
    fs.writeFileSync(file, JSON.stringify(clean(output), null, 2));
    console.log(`${request.sample.id} ${arm} ${repeat}: protocol=${result.success ? 'passed' : 'failed'}; semantic=pending`);
  }
}
await Promise.all([worker(), worker()]);
assert.equal(sourceFingerprint(), productionBefore, 'Production source changed during experiment');
for (const request of requests) assert.equal(hash(fs.readFileSync(request.sample.sourceFile)), request.sourceSha256, 'Original evidence changed');
fs.writeFileSync(path.join(directory, 'completed.json'), JSON.stringify({ completedAt: new Date().toISOString(), calls: jobs.length, productionSourceUnchanged: true, originalEvidenceUnchanged: true, productionSourceSHA256: productionBefore }, null, 2));
console.log(`Completed ${jobs.length} actual requests; no production source or stored configuration writes.`);
