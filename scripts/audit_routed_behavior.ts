import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Offline structural audit only. It does not label semantic correctness or refusals.
const directory = path.resolve(process.argv[2] || 'artifacts/routed-behavior/first-run');
const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
assert.equal(report.status, 'execution-complete-review-pending', 'Wait until live execution has finished');
const failures: unknown[] = [];
let turns = 0, calls = 0, tokens = 0, retries = 0, committed = 0;
const actualModels = new Set<string>();
for (const scenario of report.scenarios) {
  let prior: any[] = [];
  const prefixes = new Map<string, unknown>();
  for (const turn of scenario.turns) {
    turns++; tokens += turn.tokens || 0; retries += turn.formatRetries || 0;
    const trace = JSON.parse(fs.readFileSync(path.join(directory, turn.traceFile), 'utf8'));
    const spans = trace.spans.filter((s: any) => s.type === 'agent_call');
    calls += spans.length;
    for (const span of spans) actualModels.add(span.model);
    try {
      assert(Object.values(turn.checks).every(v => v === true), 'commit/revision/atomicity checks');
      for (const span of spans) {
        assert(['text_router', 'text_designer', 'text_storyteller'].includes(span.agentId), 'no legacy/classification stage');
        const messages = span.resolvedMessages;
        assert(messages.length >= 3, 'actual resolved request recorded');
        assert(messages.at(-1).content.includes(turn.input), 'original input available');
        assert(!span.requestParams?.tools, 'no additional tool workflow');
        const prefix = messages.slice(0, 2);
        if (prefixes.has(span.agentId)) assert.deepEqual(prefix, prefixes.get(span.agentId), 'stable system/setting prefix');
        else prefixes.set(span.agentId, prefix);
        const historical = messages.slice(2, -1);
        assert.equal(historical.length, prior.length * 2, 'full committed history retained');
        for (const [i, old] of prior.entries()) {
          assert.equal(historical[i * 2].content, old.input);
          assert.equal(historical[i * 2 + 1].content, `${old.narration}\n\n【时间点 ${old.anchor}】`);
        }
        if (span.agentId !== 'text_router') assert.equal(span.inputContext.routingInstructions, turn.routing?.instructions ?? span.inputContext.routingInstructions);
        if (span.agentId === 'text_designer' && span.inputContext.material.cards) {
          for (const card of span.inputContext.material.cards) {
            const expected = prior.filter(old => old.designs.some((d: any) => d.character_id === card.character_id)).map(old => old.anchor);
            assert.deepEqual(card.state_history.map((s: any) => s.anchor), expected, 'NPC state anchors match committed history');
          }
        }
        if (span.agentId === 'text_storyteller') {
          assert(!('private_world' in span.inputContext.material), 'private state excluded from narrator material');
          assert(span.inputContext.material.performances.every((p: any) => (p.expression || p.action) && !('end_state' in p)), 'only nonempty public performance included');
        }
      }
    } catch (error) { failures.push({ scenario: scenario.id, turn: turn.index, error: String(error) }); }
    if (turn.status === 'committed') { committed++; prior.push(turn); }
  }
}
const result = { turns, committed, failed: turns - committed, actualAgentCalls: calls, models: [...actualModels], tokens, formatRetries: retries,
  structuralFailures: failures, note: 'Only request/commit structure; semantic and refusal conclusions require reading outputs.' };
fs.writeFileSync(path.join(directory, 'structural-audit.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
