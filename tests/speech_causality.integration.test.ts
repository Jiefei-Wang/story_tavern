import test from 'node:test';
import assert from 'node:assert/strict';
import { GamePipeline } from '../src/engine/pipeline/GamePipeline';
import { agentRuntime } from '../src/engine/runtime/AgentRuntime';
import { CHARACTER_CHANGE_AUDITOR } from '../src/engine/world/CharacterChangeAuditor';
import { mockActionResolution } from '../src/engine/world/ActionResolution';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import { DEFAULT_BACKENDS } from './fixtures/legacyInitialData';
import { definition, field, worldFor } from './fixtures/characterWorlds';
import { eventsElapsedSeconds } from '../src/engine/scheduling/TurnTiming';
import type { GameTurn } from '../src/types';

// Stub game agents but exercise the actual auditor transport, closed protocol,
// trace persistence and pipeline correction/commit path together.
for (const stillWrong of [false, true]) test(`speech-only contradiction ${stillWrong ? 'is withheld after failed correction' : 'is corrected without replacing the frozen physical action'}`, async t => {
  const schema = definition([field('reliability')]);
  const world = worldFor(schema);
  world.clock = '2026-09-12T12:00:00.000Z';
  world.entities.coat = { type: 'item', name: '雨衣', location: 'erin' };
  const events = [{ id: 'ask', type: 'speech' as const, actor: 'player', target: 'erin', content: '你手里已经拿着雨衣了，我想确认一下，你刚才是不是已经从桌子上把它接过去了？', duration: 20 }];
  const blocks = [{ id: 'talk', kind: 'normal', events }];
  const bad = '我刚才没有接到雨衣。', corrected = '我已经接到雨衣。';
  let reactionCalls = 0, auditCalls = 0;
  const calls: any[] = [];
  const original = agentRuntime.runAgent.bind(agentRuntime);
  const backend = { ...DEFAULT_BACKENDS[0], id: 'speech_audit_backend', authType: 'none' as const, baseUrl: 'https://speech-audit.invalid' };
  const groups = [{ id: 'unit_test', name: 'unit test', bindings: [{ agentId: 'character_change_auditor', backendId: backend.id, model: 'audit-test' }] }];
  t.mock.method(globalThis, 'fetch', async () => {
    auditCalls++;
    const data = auditCalls === 1 || stillWrong
      ? { valid: false, issues: [], speechIssues: [{ intentIndex: 1, reason: '已接过并持有雨衣，无动机声称未收到。' }] }
      : { valid: true, issues: [], speechIssues: [] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }), { headers: { 'content-type': 'application/json' } });
  });
  t.mock.method(agentRuntime, 'runAgent', async (args: any) => {
    calls.push(structuredClone({ agentId: args.agentId, context: args.context, instructions: args.instructions, traceId: args.traceId }));
    if (args.agentId === 'character_change_auditor') return original({ ...args, agents: [CHARACTER_CHANGE_AUDITOR], groups, backends: [backend] });
    let data: any;
    switch (args.agentId) {
      case 'input_compiler': data = { blocks }; break;
      case 'action_adjudicator': data = mockActionResolution(args.context.events, args.context.world, args.context.playerInput); break;
      case 'perception': data = { npcObservations: { erin: args.context.events.map((event: any) => ({ eventId: event.id, saw: true, heard: true })) } }; break;
      case 'npc_reaction': {
        reactionCalls++;
        // The corrective response tries to replace and lengthen the physical action.
        data = { thought: null, stateUpdates: [], intents: [
          { type: 'action', op: reactionCalls === 1 ? 'nod' : 'run_away', duration: reactionCalls === 1 ? 1 : 1200 },
          { type: 'speech', target: 'player', duration: 2, speechPlan: { summary: reactionCalls === 1 || stillWrong ? bad : corrected } },
        ] };
        break;
      }
      case 'world_resolver': data = { patches: [], acceptedStateUpdates: [], publicEvents: args.context.npcReactions.flatMap((r: any) => r.reaction.intents.map((i: any) => ({ actor: r.npcId, type: i.type, sourceIntentId: i.id, ...(i.target ? { target: i.target } : {}), ...(i.op ? { op: i.op } : {}), ...(i.speechPlan ? { speechPlan: i.speechPlan } : {}) }))) }; break;
      case 'narrator': data = { segments: args.context.committedEvents.filter((event: any) => event.type === 'npc_speech').map((event: any) => ({ type: 'speech', actor: event.actor, sourceIntentId: event.sourceIntentId, text: event.speechPlan.summary })) }; if (!data.segments.length) data.segments = [{ type: 'prose', text: '现场安静下来。' }]; break;
      case 'narration_auditor': data = { grounded: true, issues: [] }; break;
      default: throw new Error(`Unexpected agent ${args.agentId}`);
    }
    return { success: true, data, spanId: 'stub' };
  });
  const historicalBefore = structuredClone(world);
  historicalBefore.entities.erin.attributes!.reliability = 0.3;
  const historical: GameTurn = { id: 'selected_prior', turnIndex: 0, timestamp: world.clock, playerInput: 'past statement', narratorOutput: '', traceId: 'prior', activeAgentGroupId: 'unit_test', status: 'success', worldStateBefore: historicalBefore, worldStateAfter: structuredClone(world), patches: [{ op: 'replace', path: '/entities/erin/attributes/reliability', value: world.entities.erin.attributes!.reliability }] };
  const result = await new GamePipeline().executeTurn('我询问雨衣是否收到。', world, 1, { agents: [], groups: [], backends: [], activeGroupId: 'unit_test', mockMode: false, worldDefinition: { version: 1, characterSchema: schema }, recentTurns: [historical] });
  assert.equal(result.success, true, result.error);
  assert.equal(reactionCalls, 2);
  assert.equal(auditCalls, 2, JSON.stringify(calls.map(call => ({ agentId: call.agentId, interaction: call.context.interaction, reaction: call.context.reaction, intents: call.context.npcReactions?.map((r: any) => r.reaction.intents) }))));
  const audits = calls.filter(call => call.agentId === 'character_change_auditor');
  assert.deepEqual(audits[0].context.audit.proposedStateUpdates, []);
  assert.equal(audits[0].context.audit.visibleObjects.coat.location, 'erin');
  const trajectory = audits[0].context.audit.settledStateHistory;
  assert.equal(trajectory.turns[0].turnId, 'selected_prior');
  assert.equal(trajectory.turns[0].fields.find((field: any) => field.path === '/attributes/reliability').before, 0.3);
  assert.equal(trajectory.turns[1].scope, 'current_turn');
  assert.equal(trajectory.turns[1].fields.find((field: any) => field.path === '/attributes/reliability').status, 'unchanged');
  assert.deepEqual(audits[1].context.audit.settledStateHistory, trajectory, 'a corrective proposal must not alter already committed trajectory');
  assert.equal(audits[1].context.audit.intents[0].op, 'nod');
  assert.equal(audits[1].context.audit.intents[0].duration, 1);
  const resolver = calls.find(call => call.agentId === 'world_resolver');
  assert.deepEqual(resolver.context.npcReactions[0].reaction.intents.filter((intent: any) => intent.type === 'action').map((intent: any) => [intent.op, intent.duration]), [['nod', 1]]);
  const publicSpeech = result.turn.committedEvents!.filter(event => event.type === 'npc_speech');
  assert.deepEqual(publicSpeech.map(event => event.speechPlan?.summary), stillWrong ? [] : [corrected]);
  assert.ok(!result.turn.narratorOutput.includes(bad));
  assert.equal(result.turn.worldStateAfter.entities.coat.location, 'erin');
  assert.equal(result.turn.worldStateAfter.clock, new Date(Date.parse(world.clock) + eventsElapsedSeconds(events) * 1000).toISOString());
  const trace = globalTraceManager.getTrace(audits[0].traceId)!;
  const auditSpans = trace.spans.filter(span => span.agentId === 'character_change_auditor');
  assert.equal(auditSpans.length, 2);
  assert.equal((auditSpans[0].parsedOutput as any).speechIssues[0].intentIndex, 1);
  assert.match(auditSpans[0].liveContent!, /已接过并持有雨衣/);
  assert.ok(auditSpans[0].rawResponse);
  if (stillWrong) assert.ok(trace.spans.some(span => span.type === 'character_update_validation' && JSON.stringify(span.parsedOutput).includes('已接过并持有雨衣')));
});
