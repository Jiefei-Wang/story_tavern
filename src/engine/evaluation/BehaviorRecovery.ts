import type { TraceSpan } from "../../types";

const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const snapshot = (span?: TraceSpan) => span ? {
  spanId: span.id, status: span.status, input: span.inputContext,
  output: span.parsedOutput, error: span.error,
} : null;
const last = <T>(values: T[]): T | undefined => values[values.length - 1];
const countStatuses = (values: { status: string }[]) => Object.fromEntries([...new Set(values.map(value => value.status))].map(status => [status, values.filter(value => value.status === status).length]));

/** Observational sidecar only: never overrides structural or manual behavioral verdicts. */
export function summarizeBehaviorRecovery(spans: TraceSpan[]) {
  const jsonFormatRetries = spans.filter(span => span.type === "format_retry").map(marker => {
    const original = spans.find(span => span.id === marker.parentId && span.id === object(marker.inputContext).originalSpanId && span.agentId);
    const cause = object(marker.inputContext).cause || (original?.parsedOutput === undefined && /Output schema expects JSON, but parsing failed/.test(original?.error || "") ? "json_syntax" : "unknown");
    const finalId = object(marker.parsedOutput).successfulRetrySpanId || object(marker.parsedOutput).retrySpanId;
    const final = original && spans.find(span => span.id === finalId && span.parentId === marker.id && span.agentId === original.agentId);
    const eligible = original?.status === "error" && (cause === "json_syntax" ? original.parsedOutput === undefined && /Output schema expects JSON, but parsing failed/.test(original.error || "") : cause === "json_schema" && original.parsedOutput !== undefined && /schema|Semantic Validation Failed/i.test(original.error || ""));
    return {
      status: eligible && marker.status === "success" && final?.status === "success" && final.parsedOutput !== undefined ? "recovered" : marker.status === "error" || final?.status === "error" ? "failed" : "incomplete",
      cause, retry: snapshot(marker), first: snapshot(original), final: snapshot(final), agent: original?.agentId,
    };
  });
  const actionProtocolRetries = spans.filter(span => span.type === "action_protocol_retry").map(marker => {
    const original = spans.find(span => span.id === object(marker.inputContext).originalSpanId && span.agentId === "action_adjudicator");
    const firstValidation = original && spans.find(span => span.parentId === original.id && span.type === "action_resolution_validation");
    // A successful marker means the retry was scheduled, not that it completed.
    const candidates = original && firstValidation?.id === marker.parentId ? spans.slice(spans.indexOf(marker) + 1).filter(span =>
      span.agentId === "action_adjudicator" && span.parentId === original.parentId &&
      span.blockId === original.blockId && span.blockIndex === original.blockIndex &&
      spans.some(validation => validation.parentId === span.id && validation.type === "action_resolution_validation" && object(validation.inputContext).attempt === 1),
    ) : [];
    const final = candidates.length === 1 ? candidates[0] : undefined;
    const finalValidation = final && spans.find(span => span.parentId === final.id && span.type === "action_resolution_validation" && object(span.inputContext).attempt === 1);
    return {
      status: final?.status === "success" && finalValidation?.status === "success" ? "recovered" : final?.status === "error" || finalValidation?.status === "error" ? "failed" : "incomplete",
      retry: snapshot(marker), first: { agent: snapshot(original), validation: snapshot(firstValidation) },
      final: { agent: snapshot(final), validation: snapshot(finalValidation) },
    };
  });

  const characterCausalCorrections = spans.filter(span => span.type === "character_update_validation").map(validation => {
    const output = object(validation.parsedOutput);
    const rejected = list(output.rejected);
    const initiallyRejectedForCorrection = rejected.filter(item => item.corrected === true);
    const stillRejected = rejected.filter(item => item.corrected !== true);
    const acceptedCandidates = list(output.accepted);
    const prefix = `${validation.parentId}_`;
    const npcId = validation.id.startsWith(prefix) && validation.id.endsWith("_state_updates") ? validation.id.slice(prefix.length, -"_state_updates".length) : undefined;
    const audits = npcId === undefined ? [] : spans.filter(span => span.agentId === "character_change_auditor" && span.parentId === validation.parentId && object(object(span.inputContext).audit).npcId === npcId && spans.indexOf(span) < spans.indexOf(validation));
    const attempted = initiallyRejectedForCorrection.length > 0;
    return {
      npcId, validationSpanId: validation.id,
      status: validation.status !== "success" ? "incomplete" : stillRejected.length ? attempted ? "still_rejected_after_correction" : "rejected_without_correction" : attempted ? acceptedCandidates.length ? "corrected_candidates" : "withdrawn_all_candidates" : "no_recorded_correction",
      correctionAttempted: attempted,
      first: { proposed: list(output.proposed), rejectedForCorrection: initiallyRejectedForCorrection, audit: snapshot(audits[0]) },
      final: { acceptedCandidates, stillRejected, audit: snapshot(last(audits)), validation: snapshot(validation) },
      auditAttempts: audits.map(span => snapshot(span)),
      note: "corrected 标记只证明曾要求修正；以最终候选和仍拒绝项分别统计。accepted 尚非提交，撤回提议也不代表属性发生变化。",
    };
  });
  // Preserve unfinished audits too; a missing final validation cannot establish recovery.
  const coveredAuditIds = new Set(characterCausalCorrections.flatMap(item => item.auditAttempts.map(audit => audit!.spanId)));
  const unfinishedCharacterAudits = spans.filter(span => span.agentId === "character_change_auditor" && !coveredAuditIds.has(span.id)).map(span => snapshot(span));

  const narrators = spans.filter(span => span.agentId === "narrator");
  const audits = spans.filter(span => span.agentId === "narration_auditor");
  const firstRejectedAudit = audits.find(span => span.status === "success" && object(span.parsedOutput).grounded === false);
  const subsequentNarrators = firstRejectedAudit ? narrators.filter(span => spans.indexOf(span) > spans.indexOf(firstRejectedAudit)) : [];
  const finalAudit = last(audits), finalNarrator = last(narrators);
  const finalValidation = last(spans.filter(span => span.type === "narrator_validation"));
  const rewriteAttempted = subsequentNarrators.length > 0;
  const finalAuditAfterRewrite = finalAudit && finalNarrator && spans.indexOf(finalAudit) > spans.indexOf(finalNarrator);
  const narrationRewrite = {
    status: !rewriteAttempted ? firstRejectedAudit ? "rejected_without_completed_rewrite" : "no_recorded_rewrite" : finalNarrator?.status === "success" && finalAuditAfterRewrite && finalAudit?.status === "success" && object(finalAudit.parsedOutput).grounded === true && finalValidation?.status === "success" ? "corrected" : finalNarrator?.status === "error" || finalAudit?.status === "error" || (finalAuditAfterRewrite && object(finalAudit?.parsedOutput).grounded === false) || finalValidation?.status === "error" ? "failed" : "incomplete",
    rewriteAttempted,
    first: { narrator: snapshot(narrators[0]), audit: snapshot(audits[0]), rejectedAudit: snapshot(firstRejectedAudit) },
    final: { narrator: snapshot(finalNarrator), audit: snapshot(finalAudit), validation: snapshot(finalValidation) },
    narratorAttempts: narrators.map(span => snapshot(span)), auditAttempts: audits.map(span => snapshot(span)),
    note: "corrected 仅表示一次重写后审计与组合校验通过；首轮问题仍保留，剧情正确性仍须人工审阅。",
  };
  return {
    note: "这些是程序协议恢复与审计修正，均不是世界内拒绝，也不覆盖阶段一严格口径或阶段二人工判定。首次/最终结果保留在原 trace 的副本中。",
    jsonFormatRetries, actionProtocolRetries, characterCausalCorrections, unfinishedCharacterAudits, narrationRewrite,
    counts: {
      jsonFormatRetries: { attempted: jsonFormatRetries.length, ...countStatuses(jsonFormatRetries) },
      actionProtocolRetries: { attempted: actionProtocolRetries.length, ...countStatuses(actionProtocolRetries) },
      characterCausalCorrections: { attempted: characterCausalCorrections.filter(item => item.correctionAttempted).length, ...countStatuses(characterCausalCorrections), unfinishedAuditCalls: unfinishedCharacterAudits.length },
      narrationRewrites: { attempted: rewriteAttempted ? 1 : 0, status: narrationRewrite.status },
    },
  };
}
