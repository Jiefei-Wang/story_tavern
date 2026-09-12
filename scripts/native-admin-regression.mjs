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
  const body = await response.json();
  assert(!body.error, body.error);
  return body.result;
}

await command('newGame');
await command('mock', { enabled: false });
const input = 'admin:让士兵晕倒';
const evidence = [];
for (const action of ['send', 'retry']) {
  const success = await command(action, action === 'send' ? { input } : {});
  const state = await command('state');
  assert.equal(success, true, state.error);
  assert.equal(state.error, null);
  assert.equal(state.activeSave.turns.length, 2);
  const turn = state.activeSave.turns.at(-1);
  assert.equal(turn.playerInput, input);
  assert.equal(turn.status, 'success');
  assert(!turn.narrationError, turn.narrationError);
  assert(turn.patches.some(p => p.path.startsWith('/entities/guard/')));
  if (action === 'retry') assert.equal(turn.variations.length, 2);
  evidence.push({ action, input, patches: turn.patches, narratorOutput: turn.narratorOutput, traceId: turn.traceId });
  console.log(`PASS ${action}: ${input}`, JSON.stringify(turn.patches));
}
await writeFile('.tmp/admin-regression.json', JSON.stringify(evidence, null, 2));
