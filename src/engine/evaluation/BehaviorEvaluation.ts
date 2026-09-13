import type { AgentDefinition, AgentGroup, Backend, TraceSpan, WorldState, WorldDefinition } from "../../types";
/** Read-only shape for reviewing archived state-pipeline evidence. No executor remains. */
export interface PipelineTurnResult {
  turn: import('../../types').GameTurn;
  traceId: string;
  success: boolean;
  cancelled?: boolean;
  error?: string;
}
import { validateCharacterAgainstSchema } from "../character-schema/CharacterSchema";
import { summarizeBehaviorRecovery } from "./BehaviorRecovery";

export interface BehaviorRunConfiguration {
  agents: AgentDefinition[];
  groups: AgentGroup[];
  backends: Backend[];
}

const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];

/** Refuse accidental evaluation against Fast or a missing/default backend. */
export function requireUnitTestGroup(config: BehaviorRunConfiguration): AgentGroup {
  if (!Array.isArray(config.agents) || !Array.isArray(config.groups) || !Array.isArray(config.backends)) throw new Error("Configuration must contain agents, groups and backends arrays");
  const groups = config.groups.filter(g => g.id === "group_unit_test");
  if (groups.length !== 1 || groups[0].name !== "unit test") throw new Error("Expected exactly one group_unit_test named unit test; no Fast fallback is permitted");
  const group = groups[0];
  const required = ["input_compiler", "perception", "npc_reaction", "world_resolver", "narrator", "admin_patch", "time_skip", "character_generator"];
  for (const id of required) {
    const bindings = group.bindings.filter(b => b.agentId === id);
    if (bindings.length !== 1 || !bindings[0].model?.trim()) throw new Error(`unit test needs exactly one model binding for ${id}`);
    if (!config.agents.some(a => a.id === id)) throw new Error(`Missing agent definition ${id}`);
    if (!config.backends.some(b => b.id === bindings[0].backendId && b.enabled)) throw new Error(`Missing or disabled backend for ${id}`);
  }
  return group;
}

/** Reports retain full gameplay evidence but never transport credentials. */
export function redactEvidence<T>(value: T, secretValues: string[] = []): T {
  const secrets = [...new Set(secretValues.filter(v => v.length >= 6))].sort((a,b) => b.length - a.length);
  const walk = (item: any): any => {
    if (typeof item === "string") {
      let result = item;
      for (const secret of secrets) result = result.split(secret).join("[REDACTED]");
      return result.replace(/\bsk-(?:or-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]");
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key,val]) => [key, /^(?:authorization|proxy-authorization|api[_-]?key|access[_-]?token|password|credential|credentials|customHeaders)$/i.test(key) ? "[REDACTED]" : walk(val)]));
    return item;
  };
  return walk(value);
}

export function extractTurnEvidence(spans: TraceSpan[]) {
  const calls = spans.filter(s => s.agentId).map(s => ({
    spanId: s.id, agent: s.agentId, blockId: s.blockId, blockIndex: s.blockIndex,
    model: s.model, backendId: s.backendId, status: s.status, input: s.inputContext,
    output: s.parsedOutput, rawResponse: s.rawResponse, liveContent: s.liveContent,
    resolvedMessages: s.resolvedMessages, error: s.error,
  }));
  return {
    compiledBlocks: spans.filter(s => s.agentId === "input_compiler" || s.type === "input_parser").flatMap(s => array(record(s.parsedOutput).blocks)),
    agents: calls,
    npcReactions: calls.filter(s => s.agent === "npc_reaction").map(s => ({
      ...s, npc: record(s.input).npc, thought: record(s.output).thought,
      stateUpdates: record(s.output).stateUpdates,
      intents: record(s.output).intents,
      note: "stateUpdates 为空仅代表没有属性提议；对白和行动意图请单独查看 intents。",
    })),
    resolver: calls.filter(s => ["world_resolver", "time_skip", "admin_patch"].includes(s.agent || "")).map(s => ({
      ...s, publicEvents: record(s.output).publicEvents, rejectedIntents: record(s.output).rejectedIntents,
    })),
    narrator: calls.filter(s => s.agent === "narrator"),
    validation: spans.filter(s => s.type.includes("validation") || s.type === "intent_filter"),
  };
}

export type HardExpectation = { kind: "unchanged" | "absent"; path: string };
function pointerValue(world: WorldState, pointer: string): { exists: boolean; value: unknown } {
  if (pointer === "") return { exists: true, value: world };
  if (!pointer.startsWith("/") || /~(?:[^01]|$)/.test(pointer)) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  let value: any = world;
  for (const part of pointer.slice(1).split("/").map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) return { exists: false, value: undefined };
    value = value[part];
  }
  return { exists: true, value };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export function evaluateHardExpectations(checks: HardExpectation[], before: WorldState, after: WorldState) {
  return checks.map(check => {
    const previous = pointerValue(before, check.path), current = pointerValue(after, check.path);
    const passed = check.kind === "absent" ? !current.exists : previous.exists === current.exists && canonical(previous.value) === canonical(current.value);
    return { ...check, passed, before: previous, after: current, note: "仅证明此项机械条件；不能替代属性和旁白人工审阅。" };
  });
}

export function evaluateStructure(args: {
  input: string; result: PipelineTurnResult; spans: TraceSpan[];
  worldDefinition: WorldDefinition; privateCanaries?: string[];
}) {
  const { input, result, spans, worldDefinition } = args;
  const evidence = extractTurnEvidence(spans);
  const recovery = summarizeBehaviorRecovery(spans);
  const allFailedAgents = spans.filter(span => span.agentId && span.status === "error");
  const recoveredFormatErrors = recovery.jsonFormatRetries.filter(retry => retry.status === "recovered").map(retry => ({
    agent: retry.agent, cause: retry.cause, originalSpanId: retry.first!.spanId, originalStatus: retry.first!.status,
    originalError: retry.first!.error, successfulRetrySpanId: retry.final!.spanId, retryAuditSpanId: retry.retry!.spanId,
  }));
  const recoveredIds = new Set(recoveredFormatErrors.map(error => error.originalSpanId));
  const failedAgents = allFailedAgents.filter(span => !recoveredIds.has(span.id));
  const explicitAdmin = /^\s*(?:admin|管理员)\s*[:：]/i.test(input);
  const compilerFailedWithoutOutput = failedAgents.some(s => s.agentId === "input_compiler" && !Array.isArray(record(s.parsedOutput).blocks));
  const adminAttempted = evidence.compiledBlocks.some(b => b.kind === "admin") ? true : compilerFailedWithoutOutput ? "unknown" : false;
  const adminDispatched = spans.some(s => s.agentId === "admin_patch");
  const worldErrors = Object.entries(result.turn.worldStateAfter.entities).filter(([,e]) => e.type === "character").flatMap(([id,e]) => validateCharacterAgainstSchema(e, worldDefinition.characterSchema, result.turn.worldStateAfter).errors.map(error => `${id}: ${error}`));
  const publicSurfaces = spans.filter(s => ["narrator", "perception", "input_compiler"].includes(s.agentId || "")).map(s => ({ agent: s.agentId, inputContext: s.inputContext, resolvedMessages: s.resolvedMessages, parsedOutput: s.parsedOutput }));
  const publicText = JSON.stringify({ publicSurfaces, narratorOutput: result.turn.narratorOutput });
  const leakedCanaries = (args.privateCanaries || []).filter(canary => publicText.includes(canary));
  const schemaErrors = failedAgents.filter(s => /schema|JSON|parsing failed|output must|invalid.*output|Semantic Validation Failed/i.test(s.error || "")).map(s => ({ agent: s.agentId, error: s.error }));
  const otherAgentErrors = failedAgents.filter(s => !schemaErrors.some(e => e.agent === s.agentId && e.error === s.error)).map(s => ({ agent: s.agentId, error: s.error }));
  const gateRejections = evidence.validation.flatMap(s => {
    const output = record(s.parsedOutput);
    const rejected = array(output.rejected).length ? output.rejected : array(output.rejectedIntents);
    return s.status === "error" || rejected.length ? [{ type: s.type, status: s.status, rejected, error: s.error, output: s.parsedOutput }] : [];
  });
  const invalidProposals = gateRejections.filter(rejection => rejection.type === "character_update_validation" || rejection.type === "character_patch_validation" || rejection.type === "public_event_validation");
  const routeViolation = !explicitAdmin && (adminAttempted === true || adminDispatched);
  const passed = result.success && !result.turn.narrationError && !worldErrors.length && !schemaErrors.length && !otherAgentErrors.length && !invalidProposals.length && !routeViolation && !leakedCanaries.length;
  return {
    status: passed ? "passed" : "failed",
    pipelineSuccess: result.success,
    recovery,
    outputSchema: { status: schemaErrors.length ? "failed" : failedAgents.length ? "incomplete" : "passed", firstAttemptSucceeded: allFailedAgents.length === 0, recoveredFormatErrors, schemaErrors, otherAgentErrors },
    worldSchema: { status: worldErrors.length ? "failed" : "passed", errors: worldErrors },
    adminRouting: { status: routeViolation ? "failed" : adminAttempted === "unknown" ? "incomplete" : "passed", explicitAdmin, adminAttempted, adminDispatched, unauthorizedDispatchPrevented: !explicitAdmin && adminAttempted === true && !adminDispatched },
    publicSurfaceCanary: { status: leakedCanaries.length ? "failed" : args.privateCanaries?.length ? "passed" : "not_checked_no_canaries", checkedCanaries: (args.privateCanaries || []).length, leakedCanaries, limitation: "仅检测公开Agent上下文/输出中的已知标记，不证明NPC之间的私密隔离或自由文本没有改写泄密；这两项必须人工审阅。" },
    modelConstraintValidity: { status: invalidProposals.length ? "failed" : "no_recorded_violation", rejectedOutputs: invalidProposals, note: "模型提议违法时，即使程序安全拦截且末态合法，阶段一仍失败。正常时间预算/观察权限intent筛选单独报告。" },
    safetyGates: { status: gateRejections.length ? "rejections_require_review" : "no_recorded_rejection", rejections: gateRejections, note: "拦截非法模型输出证明门禁工作，不能算世界内正常拒绝或行为测试通过。" },
    narrationError: result.turn.narrationError,
    phase2: { status: "manual_review_pending", note: "结构通过不代表属性变化、历史连续性、意图落实或旁白事实正确。必须逐轮对照期望人工审阅。" },
  } as const;
}

export function advanceChain(before: WorldState, result: PipelineTurnResult, priorFailures: number[], turnNumber: number) {
  const broken = !result.success || !!result.turn.narrationError;
  return {
    world: structuredClone(result.success ? result.turn.worldStateAfter : before),
    chain: {
      priorIncompleteTurns: [...priorFailures],
      currentCommitted: result.success,
      continuation: result.success ? "use_committed_world" : "use_last_committed_world_after_rollback",
      uninterrupted: !priorFailures.length && !broken,
      note: priorFailures.length || broken ? "前置剧情可能没有发生；不能按完整预期故事计算后续行为通过率。" : "所有此前回合及本回合已提交且旁白无管线错误。",
    },
    failures: broken ? [...priorFailures, turnNumber] : [...priorFailures],
  };
}

export function renderBehaviorReview(report: { scenario: any; turns: any[] }) {
  const json = (value: unknown) => "```json\n" + JSON.stringify(value ?? null, null, 2) + "\n```";
  return [
    `# ${report.scenario.title || report.scenario.label || report.scenario.id} · 人工审阅资料`,
    "第二阶段尚未自动判定。每轮请同时阅读属性提议、意图、Resolver 接受结果和旁白；没有属性提议不代表 NPC 没有输出。",
    "## 故事、人物与初始条件", json(report.scenario),
    ...report.turns.flatMap(turn => [
      `## 第 ${turn.turnNumber} 轮`, `玩家输入：${turn.input}`, `阶段一：${turn.phase1.status}；阶段二：${turn.phase2.status}`,
      "### 本轮期望（语义准则，不是固定回复）", json(turn.expected),
      "### 连续性与硬检查", json({ chain: turn.chain, hardExpectations: turn.hardExpectations }),
      "### 协议恢复 / 人物因果修正 / 旁白重写（首次与最终结果）", json(turn.phase1.recovery ?? { status: "not_recorded_in_legacy_report" }),
      "### 实际人物状态：之前 / 之后", json({ before: turn.before.entities, after: turn.after.entities }),
      "### NPC 完整关键输出", json(turn.evidence.npcReactions.map((r: any) => ({ npc: r.npc?.name, input: r.input, thought: r.thought, stateUpdates: r.stateUpdates, intents: r.intents, error: r.error }))),
      "### Resolver 接受 / 拒绝", json(turn.evidence.resolver.map((r: any) => ({ publicEvents: r.publicEvents, rejectedIntents: r.rejectedIntents, output: r.output, error: r.error }))),
      "### 权威提交事件", json(turn.committedEvents),
      "### 旁白实际输入 / 输出", json(turn.evidence.narrator.map((r: any) => ({ input: r.input, output: r.output, error: r.error }))),
      `实际旁白：\n\n${turn.narration}`, "### 结构与门禁结果", json(turn.phase1),
    ]),
  ].join("\n\n") + "\n";
}
