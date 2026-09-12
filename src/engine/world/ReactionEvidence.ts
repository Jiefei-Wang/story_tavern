import type { GameTurn, NPCExperience, NPCObservation, CharacterStateUpdate } from '../../types';

export function recentNpcExperiences(turns: GameTurn[], npcId: string, limit = 24): NPCExperience[] {
  // Only the selected branch before the current turn is supplied by the caller. Never infer
  // private observations from global user input, another NPC's memory, or narrator prose.
  return turns.filter(t => t.status !== 'error').flatMap(t => t.npcExperiences?.[npcId] || []).slice(-limit).map(e => structuredClone(e));
}

export function stateUpdateEvidenceError(update: CharacterStateUpdate, observations: NPCObservation[], previous: NPCExperience[]): string | null {
  const ids = update.sourceEventIds;
  if (!ids?.length) return 'stateUpdates必须引用本NPC当前观察的sourceEventIds；无来源的变化不提交';
  if (ids.some(id => !observations.some(o => o.eventId === id && (o.saw || o.heard)))) return 'sourceEventIds引用了本NPC当前不可感知的事件';
  const hasNewCause = ids.some(id => !previous.some(e => e.id === id && e.appliedStatePaths?.includes(update.path)));
  if (!hasNewCause) return '同一经历对同一字段已结算，不得重复记忆或奖励；需新的事件依据';
  return null;
}

export function captureNpcObservations(target: Record<string, NPCExperience[]>, npcId: string, observations: NPCObservation[]) {
  const list = target[npcId] ||= [];
  for (const observation of observations) if ((observation.saw || observation.heard) && !list.some(e => e.id === observation.eventId)) {
    list.push({ id: observation.eventId, observation: structuredClone(observation), appliedStatePaths: [] });
  }
}

export const REACTION_CAUSALITY_POLICY = `观察是事实来源，其中outcome.status=failed表示尝试没有成功，不能把它记成亲眼见到成功。玩家speech只证明他说了这些话，不证明主张成立。recentExperiences是你自己过去确实感知的经历，不能把它们当作本轮新行为再奖励或重新记一遍。
stateUpdates每项必须附reason与sourceEventIds（仅取本次observations.eventId）。先按字段label/description/llmGuidance理解各属性，可靠性、亲近感、疑虑、生理资源不能机械同涨同跌。承诺未兑现不能仅因坦白提高履约可靠性；诚恳道歉是修复尝试，需要先考虑同一近期失约造成的失望与压力，不能忽略失约只奖励坦白。态度缓和不等于比失约前更亲近，更不等于兑现，不能奖励同一次承认多次。变化必须对应新的证据，不必每轮更新。
递出/允诺食物不等于吃下，允诺休息不等于休息完成。计划中的action尚未执行，不能提前降低饥饿/疲劳或支付已完成动作的成本；自身物理过程的生理、资源、能力效果会在action真实执行后的独立阶段结算。本阶段只安排相应action intent，不能仅speech说愿意。若当前明确是完成过程结算阶段，则按已经接受的动作观察与真实时长评价实际效果。
追加经历只记录本轮新增、自己可感知的内容，标明说法来源、更正和失败尝试；旧事件保持历史身份，不覆写历史。当前是等待窗口时，请结合刚听到的具体问题及本轮已有回应，已经回答过不要再重复答或重复涨分；发生新行动/收到新反馈才有新的更新依据。`;
