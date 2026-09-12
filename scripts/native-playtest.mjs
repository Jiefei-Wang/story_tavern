// Run against an isolated exe built with --features test-control.
// STORY_TAVERN_TEST_TOKEN must match the token passed to the test process.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const token = process.env.STORY_TAVERN_TEST_TOKEN;
assert(token, 'STORY_TAVERN_TEST_TOKEN is required');
const endpoint = `http://127.0.0.1:${process.env.STORY_TAVERN_TEST_PORT || 4174}/command`;
const reportPath = process.env.STORY_TAVERN_TEST_REPORT || '.tmp/native-playtest.json';
async function command(action, args = {}) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }), signal: AbortSignal.timeout(310000),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert(!data.error, data.error);
  return data.result;
}
if (process.argv.includes('--verify-restart')) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const state = await command('state');
  assert.equal(state.activeSave.id, report.saveId);
  assert.equal(state.activeSave.turns.length, report.turns);
  assert.deepEqual(state.activeSave.worldState, report.worldState);
  report.restartPersisted = true;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log('PASS exe restart restores the same save, turns and world state');
} else {
  const denied = await fetch(endpoint, { method: 'POST', body: '{}' });
  assert.equal(denied.status, 403);
  const originDenied = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://example.com' }, body: '{}' });
  assert.equal(originDenied.status, 403);
  console.log('PASS control API rejects missing auth and browser origins');
  const connection = await command('connection');
  assert(connection.success, connection.error);
  console.log('PASS native OpenRouter connection', connection.model_count, 'models');
  const resume = process.argv.includes('--resume');
  if (!resume) {
    await command('mock', { enabled: false });
    await command('newGame');
  }
  const steps = resume ? (await command('state')).activeSave.turns.slice(1).map(turn => ({ input: turn.playerInput, patches: turn.patches, narratorOutput: turn.narratorOutput, traceId: turn.traceId })) : [];
  for (const input of resume ? [] : ['admin:让卫兵晕倒', '快进：10分钟', '我对艾琳说：“早上好，你叫什么名字？”然后等待她回答。']) {
    const before = await command('state');
    assert.equal(await command('send', { input }), true);
    const after = await command('state');
    assert.equal(after.error, null);
    assert.equal(after.activeSave.turns.length, before.activeSave.turns.length + 1);
    const turn = after.activeSave.turns.at(-1);
    assert.equal(turn.playerInput, input);
    assert.equal(turn.status, 'success');
    assert(!turn.narrationError, turn.narrationError);
    assert(turn.narratorOutput.length > 0);
    if (input.startsWith('admin:')) assert(turn.patches.length > 0);
    if (input.startsWith('快进')) assert.equal(Date.parse(after.activeSave.worldState.clock) - Date.parse(before.activeSave.worldState.clock), 600000);
    steps.push({ input, patches: turn.patches, narratorOutput: turn.narratorOutput, traceId: turn.traceId });
    console.log('PASS real exe turn:', input);
  }
  if (!resume) {
    const retried = await command('retry');
    assert.equal(retried, true, (await command('state')).error);
  }
  let state = await command('state');
  assert.equal(state.activeSave.turns.at(-1).variations.length, 2);
  assert.equal(state.error, null);
  await command('variation', { index: state.activeSave.turns.length - 1, variation: 0 });
  state = await command('state');
  assert.equal(state.activeSave.turns.at(-1).activeVariationIndex, 0);
  await command('save');
  await writeFile(reportPath, JSON.stringify({ connection, steps, saveId: state.activeSave.id, turns: state.activeSave.turns.length, worldState: state.activeSave.worldState, retryAndVariation: true }, null, 2));
  console.log('PASS retry, branch selection and manual SQLite save');
}
