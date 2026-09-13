import test from 'node:test';
import assert from 'node:assert/strict';
import type { NPCIntent, TemporalBlock, WorldState } from '../src/types';
import { agentRuntime } from '../src/engine/runtime/AgentRuntime';
import { mockActionResolution } from '../src/engine/world/ActionResolution';
import { definition, field, worldFor } from './fixtures/characterWorlds';
import { withCharacterContract } from '../src/engine/character-schema/AgentContract';
import { BUILTIN_AGENTS } from './fixtures/legacyInitialData';

const schema = definition([field('reliability', { default: 0.4, description: '履约可靠性；没有兑现的承诺不应该提高可靠性。' })]);
function initial(): WorldState {
  const world = worldFor(schema);
  world.entities.food = { type: 'item', name: '一份食品', location: 'tavern_room' };
  world.entities.table = { type: 'object', location: 'tavern_room' };
  return world;
}
const options = { agents: [], groups: [], backends: [], activeGroupId: 'unit_test', mockMode: false, worldDefinition: { version: 1, characterSchema: schema } };

type Handler = (args: any) => unknown | Promise<unknown>;
const isSettlement = (args: any): boolean => args.instructions?.includes('当前阶段：已经完成的物理过程效果结算') === true;

const bodySchema = definition([
  field('hunger', { default: 0.8, description: '饥饿程度，越高越饿；实际进食可降低。' }),
  field('fatigue', { default: 0.7, description: '疲劳程度，越高越疲劳；实际休息可降低。' }),
]);
function bodyWorld(): WorldState {
  const world = worldFor(bodySchema);
  world.entities.food = { type: 'item', name: '一份食品', location: 'tavern_room' };
  return world;
}
const longWait: TemporalBlock[] = [{ id: 'wait', kind: 'wait', duration: 1200 }];

test('upgraded Resolver contract removes obsolete attribute Patch instructions while preserving custom guidance', () => {
  const original = { ...BUILTIN_AGENTS.find(a => a.id === 'world_resolver')!, messages: [
    { id: 'custom', role: 'system' as const, content: '保留用户自定义的物理风格。' },
    { id: 'character_schema_contract', role: 'system' as const, content: '数值 delta 转成最终值 Patch；text append 必须连接后写入。' },
  ] };
  const upgraded = withCharacterContract(original, schema);
  assert.equal(upgraded.messages.filter(m => m.id === 'character_schema_contract').length, 1);
  assert.equal(upgraded.messages[0].content, original.messages[0].content);
  assert.doesNotMatch(JSON.stringify(upgraded.messages), /数值 delta 转成最终值 Patch|采纳某项更新时使用其中该字段的完整最终值/);
  assert.match(JSON.stringify(upgraded.messages), /completed_process/);
  assert.match(JSON.stringify(upgraded.messages), /不要提前扣除或恢复人物属性/);
  assert.match(JSON.stringify(upgraded.messages), /物品、环境和位置/);
  assert.equal(original.messages[1].content, '数值 delta 转成最终值 Patch；text append 必须连接后写入。');
});
