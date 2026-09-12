import type { CharacterSchemaDefinition, JsonPatchOperation, NPCReactionResult, WorldResolverResult, WorldState } from '../../types';
import { validateCharacterUpdate } from '../character-schema/CharacterSchema';
import * as jsonpatch from 'fast-json-patch';
import { PipelineStageError } from '../errors/PipelineStageError';

const compare = jsonpatch.default?.compare || jsonpatch.compare;
type Reaction = { npcId: string; reaction: NPCReactionResult };
const characterPath = (p: string, world: WorldState) => {
  const parts = p.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  return parts[0] === 'entities' && (parts.length === 1 || (world.entities[parts[1]]?.type === 'character' && (parts.length === 2 || ['attributes','relationships'].includes(parts[2]))));
};

/** The model selects proposals; it never implements text append or numeric arithmetic. */
export function materializeCharacterEffects(result: WorldResolverResult, world: WorldState, reactions: Reaction[], schema: CharacterSchemaDefinition): JsonPatchOperation[] {
  if (!result.acceptedStateUpdates) return result.patches || []; // explicit compatibility for saved custom resolvers
  const raw = result.patches || [];
  if (raw.some(p => characterPath(p.path, world) || (p.from && characterPath(p.from, world)))) throw new PipelineStageError('character_schema', '已使用acceptedStateUpdates时不得再手写人物属性Patch');
  const draft = structuredClone(world);
  const seen = new Set<string>();
  for (const decision of result.acceptedStateUpdates) {
    const key = `${decision.npcId}:${decision.updateIndex}`;
    const update = reactions.find(r => r.npcId === decision.npcId)?.reaction.stateUpdates?.[decision.updateIndex];
    if (!update || !Number.isInteger(decision.updateIndex) || seen.has(key)) throw new PipelineStageError('character_schema', '结算引用未知或重复人物提议');
    seen.add(key);
    const check = validateCharacterUpdate(draft.entities[decision.npcId], update, schema, draft, decision.npcId, {}, {});
    if (!check.valid) throw new PipelineStageError('character_schema', '人物提议在结算时不再有效');
    draft.entities[decision.npcId] = check.after;
  }
  return [...raw, ...compare(world.entities, draft.entities).map(p => ({...p,path:'/entities'+p.path, ...('from' in p ? {from:'/entities'+p.from} : {})})) as JsonPatchOperation[]];
}

export const CHARACTER_EFFECT_POLICY = `人物stateUpdates已由程序按Schema校验。你只通过acceptedStateUpdates:[{npcId,updateIndex}]选择本轮确有因果依据的提议（updateIndex是该npcReactions.reaction.stateUpdates中从0开始的下标）。不要手写任何现有人物attributes/relationships Patch，程序会准确处理数值和文本追加。没有可接受提议就输出空数组。人物位置等真实物理变化仍用patches。旧历史不可覆写。
本阶段负责裁决动作并用patches提交物品、环境和位置等实际物理结果；proposedCharacter只用于审阅候选，不是让你复制人物字段为Patch。人物数值delta、text/list append都由程序根据acceptedStateUpdates转换，禁止自行转换或补写未提议的人物变化。
已接受的进食、饮用、休息、施法、治疗、运动或使用能力等实际身体/资源过程，执行提交后还有独立的completed_process人物效果结算和审计。即使世界明确要求动作消耗精力或恢复身体，本阶段也不要提前扣除或恢复人物属性，不要因当前候选没有这些效果而补Patch、伪造候选或拒绝本来可行的动作。将真实物品/环境效果与带sourceIntentId的动作提交，程序随后依据已完成事件及其时长处理人物效果；narrationHints不得把尚未结算的属性效果写成已发生事实。
其他可采纳提议仍须具备当前因果依据；接受礼物依赖真实接受动作，仅speech答应不是行动。对已失败的玩家尝试，只可结算看到失败的反应，不能结算成功奖励。所有新变化必须有当前来源，不重复奖励同一经历。不要为了每轮改变数值而修改。`;

