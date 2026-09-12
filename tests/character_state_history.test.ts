import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameTurn, WorldState } from '../src/types';
import { buildSettledCharacterHistory } from '../src/engine/world/CharacterStateHistory';
import { buildCharacterChangeAuditContext } from '../src/engine/world/CharacterChangeAuditor';

function world(value: number): WorldState {
  return { clock: '2026-01-01T00:00:00', scene: { location: 'room', weather: 'clear', lighting: 'daylight' }, rules: {}, entities: {
    player: { type: 'character', location: 'room', attributes: {} },
    witness: { type: 'character', location: 'room', attributes: { assessment: value, memories: 'OWN_TEXT_NOT_NEEDED' }, relationships: { player: { closeness: 0.2 } } },
    other: { type: 'character', location: 'room', attributes: { private_number: 987654321, secret: 'OTHER_PRIVATE' } },
  } };
}
function turn(index: number, before: number, after: number): GameTurn {
  return { id: `t${index}`, turnIndex: index, status: 'success', worldStateBefore: world(before), worldStateAfter: world(after),
    timestamp: '2026-01-01T00:00:00', playerInput: 'Observed statement', narratorOutput: '', traceId: `trace${index}`, activeAgentGroupId: 'unit_test',
    patches: before === after ? [] : [{ op: 'replace', path: '/entities/witness/attributes/assessment', value: after }],
    npcExperiences: { witness: [{ id: `e${index}`, observation: { eventId: `e${index}`, type: 'speech', actor: 'player', heard: true, saw: true, content: 'An actual observed statement.' }, appliedStatePaths: before === after ? [] : ['attributes.assessment'] }], other: [{ id: 'OTHER_SOURCE', observation: { eventId: 'OTHER_SOURCE', saw: true, heard: true }, appliedStatePaths: ['attributes.assessment'] }] },
  };
}

test('actual endpoints preserve unchanged rejected turns and net recovery without using proposals or other minds', () => {
  const a = turn(1, 0.4, 0.4), b = turn(2, 0.4, 0.4), c = turn(3, 0.4, 0.48);
  (b as any).rejectedProposals = [{ value: -0.1, reason: 'NOT_COMMITTED' }];
  const history = buildSettledCharacterHistory([a, b, c], 'witness');
  const fields = history.turns.map(item => item.fields.find(field => field.path === '/attributes/assessment')!);
  assert.deepEqual(fields.map(field => [field.before, field.after, field.status]), [[0.4, 0.4, 'unchanged'], [0.4, 0.4, 'unchanged'], [0.4, 0.48, 'changed']]);
  assert.deepEqual(fields.map(field => field.sourceEventIds), [[], [], ['e3']]);
  assert(history.turns.every(item => item.fields.some(field => field.path === '/relationships/player/closeness')));
  assert.doesNotMatch(JSON.stringify(history), /987654321|OTHER_PRIVATE|OTHER_SOURCE|OWN_TEXT_NOT_NEEDED|NOT_COMMITTED/);
  assert.deepEqual(history.turns[2].fields.find(field => field.path === '/relationships/player/closeness')?.sourceEventIds, []);
});

test('history excludes failed turns and unselected variations, and labels six-turn truncation and partial current turn', () => {
  const turns = Array.from({ length: 8 }, (_, index) => turn(index + 1, index / 10, (index + 1) / 10));
  turns[7].variations = [turn(999, 0, 999999)];
  const failed = { ...turn(9, 0, 888888), status: 'error' as const };
  const current = turn(10, 0.8, 0.81);
  const history = buildSettledCharacterHistory([...turns, failed], 'witness', current);
  assert.equal(history.truncated, true);
  assert.equal(history.omittedTurns, 2);
  assert.deepEqual(history.turns.map(item => item.turnId), ['t3', 't4', 't5', 't6', 't7', 't8', 't10']);
  assert.equal(history.turns.at(-1)?.scope, 'current_turn');
  assert.doesNotMatch(JSON.stringify(history), /888888|999999/);
});

test('legacy missing endpoints and missing real patch never fabricate a settled value or source', () => {
  const old = turn(1, 0.1, 0.2); delete (old as any).worldStateBefore;
  const incomplete = turn(2, 0.2, 0.3); incomplete.patches = [];
  const history = buildSettledCharacterHistory([old, incomplete], 'witness');
  assert.equal(history.unavailableTurns, 1);
  assert.equal(history.turns.length, 1);
  assert.equal(history.turns[0].incomplete, true);
  assert.equal(history.turns[0].fields.some(field => field.path === '/attributes/assessment'), false);
});

test('audit history projection keeps actual own numeric trajectory and strips attached snapshots', () => {
  const history = buildSettledCharacterHistory([turn(1, 0.1, 0.2)], 'witness');
  (history as any).world = world(123);
  (history.turns[0] as any).other = 'ATTACHED_OTHER_PRIVATE';
  const before = world(0.2).entities.witness;
  const audit = buildCharacterChangeAuditContext({ npcId: 'witness', schema: { version: 1, sections: [] }, before, proposedCharacter: before, observations: [], recentExperiences: [], intents: [], proposedStateUpdates: [], settledStateHistory: history });
  assert.equal(audit.settledStateHistory?.turns[0].fields.find(field => field.path === '/attributes/assessment')?.before, 0.1);
  assert.doesNotMatch(JSON.stringify(audit.settledStateHistory), /ATTACHED_OTHER_PRIVATE|OTHER_PRIVATE|987654321/);
  assert.equal(buildCharacterChangeAuditContext({ ...audit, settledStateHistory: undefined }).settledStateHistory, undefined);
});

test('numeric field caps are explicit and escaped NPC IDs cannot select another entity', () => {
  const prior = turn(1, 0.1, 0.2);
  const id = 'witness/escaped~id';
  prior.worldStateBefore.entities[id] = prior.worldStateBefore.entities.witness;
  prior.worldStateAfter.entities[id] = prior.worldStateAfter.entities.witness;
  delete prior.worldStateBefore.entities.witness;
  delete prior.worldStateAfter.entities.witness;
  prior.patches = [{ op: 'replace', path: '/entities/witness~1escaped~0id/attributes/assessment', value: 0.2 }];
  for (let index = 0; index < 40; index++) {
    prior.worldStateBefore.entities[id].attributes![`n${index}`] = index;
    prior.worldStateAfter.entities[id].attributes![`n${index}`] = index;
  }
  const history = buildSettledCharacterHistory([prior], id);
  assert.equal(history.turns[0].fields.length, 32);
  assert.equal(history.turns[0].fieldsTruncated, true);
  assert.equal(history.turns[0].fields.find(field => field.path === '/attributes/assessment')?.after, 0.2);
  assert.doesNotMatch(JSON.stringify(history), /OTHER_PRIVATE|987654321/);
});
