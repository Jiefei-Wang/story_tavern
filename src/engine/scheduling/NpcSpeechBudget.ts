import type { NPCIntent, NPCReactionResult } from "../../types";
import type { RunAgentResult } from "../runtime/AgentRuntime";
import { getSafeIntentDuration } from "../world/TimingEngine";
import { globalTraceManager } from "../tracing/TraceManager";

export interface IntentBudgetRejection { intent: NPCIntent; reason: "speech_not_permitted" | "time_budget"; estimatedDuration: number; remainingSeconds: number }
export function filterNpcIntentBudget(intents: NPCIntent[], seconds: number, maySpeak: boolean, idPrefix: string, normalize: (intent: NPCIntent) => NPCIntent) {
  const accepted: NPCIntent[] = [], rejected: IntentBudgetRejection[] = [];
  let spent = 0;
  for (const [index, raw] of intents.entries()) {
    const intent = { ...normalize(raw), id: `${idPrefix}_${index}` };
    const remaining = Math.max(0, seconds - spent);
    const duration = getSafeIntentDuration(intent, remaining);
    if (intent.type === "speech" && !maySpeak) rejected.push({ intent, reason: "speech_not_permitted", estimatedDuration: duration, remainingSeconds: remaining });
    else if (spent + duration > seconds) rejected.push({ intent, reason: "time_budget", estimatedDuration: duration, remainingSeconds: remaining });
    else { accepted.push({ ...intent, duration }); spent += duration; }
  }
  return { rawIntents: intents, acceptedIntents: accepted, rejectedIntents: rejected, spentSeconds: spent };
}

/** Guard the explicit semantic obligations while allowing a shorter natural summary. */
export function compressionContractError(original: NPCIntent[], retry: NPCIntent[]): string | null {
  const originalSpeech = original.filter(intent => intent.type === "speech");
  const newSpeech = retry.filter(intent => intent.type === "speech");
  if (!newSpeech.length) return "缩短重试没有保留任何speech";
  if (newSpeech.some(intent => !originalSpeech.some(first => first.target === intent.target))) return "缩短重试改变了说话对象";
  for (const first of originalSpeech) {
    const replacements = newSpeech.filter(intent => intent.target === first.target);
    const required = first.speechPlan?.beats?.filter(beat => beat.required).map(beat => beat.meaning) || [];
    if (required.some(meaning => !replacements.some(intent => intent.speechPlan?.beats?.some(beat => beat.required && beat.meaning === meaning)))) return "缩短重试丢失了必须表达的含义";
    if ((first.speechPlan?.boundaries || []).some(boundary => !replacements.some(intent => intent.speechPlan?.boundaries?.includes(boundary)))) return "缩短重试丢失了对白边界";
    if (first.speechPlan?.stance && !replacements.some(intent => intent.speechPlan?.stance === first.speechPlan?.stance)) return "缩短重试改变了原有立场";
  }
  const remainingActions = original.filter(intent => intent.type !== "speech");
  for (const intent of retry.filter(intent => intent.type !== "speech")) {
    const index = remainingActions.findIndex(first => first.type === intent.type && first.op === intent.op && first.target === intent.target && first.content === intent.content);
    if (index < 0) return "缩短重试新增或重复了原计划没有的动作";
    remainingActions.splice(index, 1);
  }
  return null;
}

export async function fitNpcSpeechBudget(args: {
  original: NPCReactionResult; seconds: number; maySpeak: boolean; idPrefix: string;
  normalize: (intent: NPCIntent) => NPCIntent;
  retry: (instructions: string, retrySpanId?: string) => Promise<RunAgentResult<NPCReactionResult>>;
  trace?: { traceId: string; parentSpanId: string; npcId: string; blockId?: string; blockIndex?: number };
}) {
  const first = filterNpcIntentBudget(args.original.intents || [], args.seconds, args.maySpeak, args.idPrefix, args.normalize);
  let selected = first;
  let retryAttempt: ReturnType<typeof filterNpcIntentBudget> | undefined;
  let retryReason: string | undefined;
  const needsRetry = args.maySpeak && args.seconds >= 1.5 && first.rejectedIntents.some(rejection => rejection.intent.type === "speech" && rejection.reason === "time_budget") && !first.acceptedIntents.some(intent => intent.type === "speech");
  if (needsRetry) {
    const originalIntents = (args.original.intents || []).map(args.normalize);
    const instructions = `预算缩短重试（最多一次）：原计划有必要speech，但没有一句能进入${args.seconds}秒窗口。请缩短真正想说的内容并优先保留核心回应，可以省略非必要动作；不要通过谎报duration或过短summary隐瞒长篇内容。仍按原估时规则验证，不延长窗口。保留原speech的target、所有required beats的meaning原文、boundaries原文和stance；不要新增事实、承诺、立场或原计划没有的动作。summary可简洁重述核心，verbosity可选brief。thought和stateUpdates不是第二次结算，程序保留第一次的提议，你无需追加任何状态变化。仍输出NPC完整协议对象。原始计划数据：\n${JSON.stringify(originalIntents)}`;
    const trace = args.trace;
    const retrySpanId = trace ? `${trace.parentSpanId}_${trace.npcId}_speech_budget_retry` : undefined;
    if (trace && retrySpanId) {
      globalTraceManager.createSpan(trace.traceId, retrySpanId, `Shorten over-budget NPC speech: ${trace.npcId}`, "npc_speech_budget_retry", trace.parentSpanId, undefined, trace.blockId, trace.blockIndex);
      globalTraceManager.updateSpan(trace.traceId, retrySpanId, { inputContext: { availableSeconds: args.seconds, reason: "all_speech_filtered_by_time_budget", firstAttempt: first } });
    }
    try {
      const response = await args.retry(instructions, retrySpanId);
      if (!response.success || !response.data) retryReason = response.error || "缩短回复生成失败";
      else {
        const intents = (response.data.intents || []).map(args.normalize);
        retryReason = compressionContractError(originalIntents, intents) || undefined;
        retryAttempt = filterNpcIntentBudget(intents, args.seconds, args.maySpeak, args.idPrefix, args.normalize);
        if (!retryReason && retryAttempt.acceptedIntents.some(intent => intent.type === "speech")) selected = retryAttempt;
        else retryReason ||= "缩短后仍无speech通过原时间预算";
      }
      if (trace && retrySpanId) globalTraceManager.updateSpan(trace.traceId, retrySpanId, { status: retryReason ? "error" : "success", error: retryReason, parsedOutput: { firstAttempt: first, retryAttempt, selectedIntents: selected.acceptedIntents, stateUpdatesSource: "first_response_only" } });
    } catch (error: any) {
      retryReason = error?.message || String(error);
      if (trace && retrySpanId) globalTraceManager.updateSpan(trace.traceId, retrySpanId, { status: error?.name === "AbortError" ? "cancelled" : "error", error: retryReason });
      if (error?.name === "AbortError") throw error;
    }
  }
  return {
    reaction: { ...args.original, intents: selected.acceptedIntents },
    firstAttempt: first, retryAttempt, retryReason, retried: needsRetry,
    filteredIntents: [...first.rejectedIntents, ...(retryAttempt?.rejectedIntents || [])],
  };
}
