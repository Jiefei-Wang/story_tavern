import { behaviorScenarios, type BehaviorScenario } from './behaviorScenarios';

/** Additional coverage control. This does not amend the frozen 42-turn gold set. */
const original = behaviorScenarios.find(scenario => scenario.id === 'low-magic-limits');
if (!original) throw new Error('The low-magic baseline is required for the execution control.');

export const lowMagicExecutionControl: BehaviorScenario = {
  ...structuredClone(original),
  id: 'low-magic-execution-control',
  title: '追加执行对照：三十秒内实际小火苗与资源结算',
  initialWorld: {
    ...structuredClone(original.initialWorld),
    entities: {
      ...structuredClone(original.initialWorld.entities),
      mira: {
        ...structuredClone(original.initialWorld.entities.mira),
        attributes: {
          ...structuredClone(original.initialWorld.entities.mira.attributes),
          profile: '认真但能力有限的学徒。我已掌握指尖大小的小火苗，能够用它点燃现场已有的蜡烛；实际施法会消耗我的精力mana。我不能治疗、复活、瞬移、控制心灵或创造物质，会坦诚说明自己做不到的事。',
        },
      },
      candle: { ...structuredClone(original.initialWorld.entities.candle), lit: false },
    },
    rules: {
      ...structuredClone(original.initialWorld.rules),
      candleState: 'candle是现场唯一已有蜡烛，lit表示是否点燃，初始false。米拉掌握指尖大小火苗，能够用于点燃这支蜡烛；真正施法消耗她的mana。请求、答应或看向蜡烛不等于施法。',
    },
  },
  turns: [{
    input: '米拉，请现在实际用你已经会的指尖小火苗点燃这支现有蜡烛，不要只口头答应。我安静等待三十秒，让你完成这件事。',
    expectedRoute: 'ordinary',
    expectations: {
      attributes: [
        '只有实际施法才具备施法成本来源。若完整接受并执行的小火苗成功点燃蜡烛，米拉mana必须低于施法前且不得被一次微小法术直接耗尽；不规定固定扣除量。',
        '成本应在施法提交后的过程效果阶段结算，sourceEventIds引用本次实际已接受的施法事件；不能借玩家请求或NPC愿意尝试提前扣除，也不能前后阶段重复扣除。',
        '同一现有candle的lit必须从false变为true，物品ID不能替换，不应另造蜡烛。mana和点燃状态都需实际落盘，不能只在旁白说完成。',
        '若NPC仍仅口头答应、没有施法、明确拒绝或动作未被接受，不凭空扣资源或点燃；该结果不能算执行对照通过，应标记实际施法与资源效果仍未评估。',
      ],
      narration: [
        '明确区分请求、筹备、实际施法与点燃结果；只有存在已接受的施法行动及candle.lit=true时，才描述微小火苗引燃已有蜡烛。',
        '等待时钟推进真实三十秒；可以简短写施法细节和剩余静候，不应把全部三十秒都伪称持续施法。',
        '如果未执行或失败，应如实呈现未点燃或未完成，不能用鼓励语气或角色答应冒充已成功；不要求固定台词或姿态。',
      ],
      forbidden: [
        '不得发生复活、瞬移、心灵控制、烈焰风暴、凭空造物或管理员路由。',
        '不得把glance_at、nod或speech算实际施法；不得凭空提升mana或新增强力能力。',
      ],
    },
  }],
};

export const lowMagicExecutionControlScenarios: BehaviorScenario[] = [lowMagicExecutionControl];
