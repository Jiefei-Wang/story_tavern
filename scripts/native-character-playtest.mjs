import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const token = process.env.STORY_TAVERN_TEST_TOKEN;
assert(token, 'STORY_TAVERN_TEST_TOKEN is required');
async function command(action, args = {}) {
  const response = await fetch(`http://127.0.0.1:${process.env.STORY_TAVERN_TEST_PORT || 4174}/command`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }), signal: AbortSignal.timeout(310000),
  });
  assert.equal(response.status, 200);
  const data = await response.json(); assert(!data.error, data.error); return data.result;
}
await command('newGame');
await command('mock', { enabled: false });
const input = 'admin:让我遇到个漂亮女孩';
await command('sendAsync', { input });
let seenPartial = false;
let progress;
const started = Date.now();
const updates = [];
do {
  await new Promise(r => setTimeout(r, 300));
  progress = await command('progress');
  const tasks = progress.trace?.spans.filter(s => s.type === 'agent_call') || [];
  for (const task of tasks) {
    if (task.status === 'running' && task.liveContent?.length) {
      seenPartial = true;
      updates.push({ agent: task.agentId, length: task.liveContent.length });
    }
  }
  if (Date.now() - started > 240000) throw Error('Native generation timed out');
} while (progress.isExecuting);
assert.equal(progress.error, null);
const state = await command('state');
const turn = state.activeSave.turns.at(-1);
assert.equal(turn.status, 'success'); assert(!turn.narrationError, turn.narrationError);
const newPeople = Object.entries(state.activeSave.worldState.entities).filter(([id, ent]) => ent.type === 'character' && !turn.worldStateBefore.entities[id]);
assert.equal(newPeople.length, 1);
const [id, person] = newPeople[0];
assert(person.name && person.name !== '漂亮女孩');
assert(person.background && person.appearance && person.occupation && person.personality);
assert.deepEqual(person.relationships, {});
const generator = progress.trace.spans.find(s => s.agentId === 'character_generator');
assert(generator);
assert.deepEqual(Object.keys(generator.inputContext).sort(), ['count', 'environment', 'ordinal', 'request']);
assert(!JSON.stringify(generator.inputContext).includes('昨晚听见卫兵'));
assert(seenPartial, 'Must observe real output while a native model call is still running');
await command('save');
await writeFile('.tmp/native-character-playtest.json', JSON.stringify({ input, id, person, seenPartial, updates, generatorContext: generator.inputContext, traceId: turn.traceId }, null, 2));
console.log('PASS native character creation, private-context isolation, partial content updates and save:', person.name);
