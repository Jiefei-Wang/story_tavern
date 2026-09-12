import type { JsonPatchOperation, NPCIntent, NPCReactionResult, WorldEntity, WorldResolverResult, WorldState } from '../../types';
import { PipelineStageError } from '../errors/PipelineStageError';
import { applyPatches } from './PatchEngine';
import { SpatialEngine } from './SpatialEngine';
import { isSustainedProcessAction } from './TimingEngine';

type Reaction = { npcId: string; reaction: NPCReactionResult };
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const pointer = (id: string): string => `/entities/${id.replace(/~/g, '~0').replace(/\//g, '~1')}/consumed`;
function fail(message: string): never { throw new PipelineStageError('world_resolver', `NPC消费动作无法结算：${message}`); }

/** Whole-item consumption only. Bites, tastes, starts and intentions remain Resolver work. */
export function isWholeItemConsumption(intent: NPCIntent): boolean {
  if (intent.type !== 'action' || !intent.op) return false;
  const op = intent.op.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  const description = `${op} ${intent.content || ''}`;
  if (/(?:^|[\s_-])(?:start|begin|taste|sip|bite|partial|some|ask|offer|invite|plan|promise|pretend)(?:$|[\s_-])/i.test(description) || /开始|准备|打算|邀请|承诺|假装|尝一|一小口|一口|一部分|少量|一点/.test(description)) return false;
  if (['consume_item', 'eat_item', 'drink_item', 'consume', 'finish_eating', 'finish_drinking', 'finish_consuming', '吃完', '喝完', '消耗整件'].includes(op)) return true;
  // Saved agents commonly emit eat_<targetId>. Treat it as the accepted complete
  // use of that item only when the suffix exactly identifies the target.
  if (intent.target && ['eat', 'drink', 'consume'].some(verb => op === `${verb}_${intent.target!.toLowerCase()}`)) return true;
  return ['eat', 'drink'].includes(op) && /\b(?:all|entire|whole|finish(?:ed)?)\b|全部|整份|吃完|喝完/i.test(intent.content || '');
}

/** Accepted activity candidates for a separate, source-bound physiological settlement. */
export function isSustainedPhysicalProcess(intent: NPCIntent): boolean {
  return isPhysicalEffectAction(intent);
}

/** Effect eligibility is broader than duration eligibility: casting stays a short action. */
export function isPhysicalEffectAction(intent: NPCIntent): boolean {
  if (intent.type !== 'action' || !intent.op) return false;
  // Casting can have a resource cost even when its physical animation is brief;
  // this does not enlarge the duration budget. Ordinary glance/nod stay excluded.
  const op = intent.op.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  if (/(?:^|_)(?:ask|offer|invite|plan|promise|request|describe|pretend|agree|say|discuss|intend|command|order)(?:_|$)|请求|邀请|打算|承诺|假装|描述|答应|命令/.test(op)) return false;
  if (isSustainedProcessAction(intent.op)) return true;
  return /(?:^|_)(?:cast|spellcast|spellcasting|heal|treat|run|sprint|jog|exercise|lift|carry)(?:_|$)|(?:^|_)(?:use|activate)_(?:ability|skill|power)(?:_|$)|施法|使用能力|发动技能|治疗|疗伤|奔跑|疾跑|跑步|搬运/.test(op);
}

function accessibleItem(world: WorldState, actor: string, item: WorldEntity): boolean {
  const character = world.entities[actor];
  if (!character || character.type !== 'character' || !SpatialEngine.isEntityInScene(actor, character, world)) return false;
  let location = item.location;
  const visited = new Set<string>();
  while (typeof location === 'string' && location && !visited.has(location)) {
    if (location === actor || location === character.location || location === world.scene.location) return true;
    visited.add(location);
    const container = world.entities[location];
    if (!container || container.type === 'character') return false;
    if (container.locked === true || container.open === false) return false;
    location = container.location;
  }
  return false;
}

/**
 * Returns ADDITIONAL patches, to append to result.patches. Only source-verified,
 * accepted whole-item consumption has a deterministic material consequence.
 * No item is deleted, no character attributes are inferred, and rejected or
 * unaccepted plans produce no effects. The caller must already enforce budget.
 */
export function materializeNpcPhysicalEffects(result: WorldResolverResult, world: WorldState, reactions: Reaction[]): JsonPatchOperation[] {
  const accepted = (result.publicEvents || []).filter(event => event.type === 'action');
  const pending = applyPatches(world, result.patches || []);
  if (!pending.success) fail('Resolver已有Patch无效');
  const extra: JsonPatchOperation[] = [];
  const consumedThisBatch = new Set<string>();
  for (const event of accepted) {
    const reaction = reactions.find(candidate => candidate.npcId === event.actor)?.reaction;
    const intent = reaction?.intents.find(candidate => candidate.id && candidate.id === event.sourceIntentId);
    // A newly generated character may have a separately validated arrival event.
    // This helper owns consumption consequences, not unrelated event coverage.
    if (!intent && !isWholeItemConsumption({ type: 'action', op: event.op, target: event.target, content: event.content })) continue;
    if (!intent || intent.type !== 'action' || intent.op !== event.op || intent.target !== event.target) fail('接受事件没有匹配的原始人物意图');
    // Determine completion from the original intent, not the intentionally terse
    // public event. Its content may carry "whole meal" or "only one bite".
    if (!isWholeItemConsumption(intent)) continue;
    if ((result.rejectedIntents || []).some(({ intent: rejected }) => rejected.id ? rejected.id === intent.id : rejected.type === intent.type && rejected.op === intent.op && rejected.target === intent.target)) fail('同一个消费意图同时被接受与拒绝');
    const target = intent.target;
    if (!target || !own(world.entities, target) || world.entities[target].type !== 'item') fail('目标必须是已有物品');
    const item = world.entities[target];
    if (item.consumed === true || consumedThisBatch.has(target)) fail('同一物品已经消费，不能再次消费');
    if (!accessibleItem(world, event.actor, item)) fail('物品不可达、容器未打开或正由别人持有');
    consumedThisBatch.add(target);
    const after = pending.newWorld.entities[target];
    if (!after || after.type !== 'item') fail('消费不得删除或替换物品历史');
    const consumedPath = pointer(target);
    if ((result.patches || []).some(patch => patch.path === consumedPath && patch.op !== 'test' && patch.value !== true)) fail('已有Patch与完成消费相冲突');
    if (after.consumed === true) continue; // Resolver already supplied the same effect.
    extra.push({ op: own(after, 'consumed') ? 'replace' : 'add', path: consumedPath, value: true });
  }
  for (const [id, after] of Object.entries(pending.newWorld.entities)) {
    const before = world.entities[id];
    if (after.type === 'item' && after.consumed === true && before?.consumed !== true && !consumedThisBatch.has(id)) {
      fail('Resolver不能在没有已接受完整消费意图时手写consumed=true');
    }
  }
  for (const [id, before] of Object.entries(world.entities)) {
    if (before.type === 'item' && before.consumed === true && pending.newWorld.entities[id]?.consumed !== true) {
      fail('Resolver不能复原或删除已经消费的物品记录');
    }
  }
  return extra;
}

export const NPC_CONSUMPTION_POLICY = '只有完整消费一件已有物品时使用action op=consume_item、eat_item或drink_item并填写该物品target。吃一口、尝试、开始、部分饮用与计划不等于整件耗尽，必须使用明确的partial/start/taste等动作名，不能伪报consume_item。完成消费的时间必须符合窗口；程序会保留物品实体并标记consumed=true，不能再次消费已耗尽物品。';
