import type { AgentDefinition, GameEvent, JsonPatchOperation, WorldState } from "../../types";
import { agentRuntime, type RunAgentOptions } from "../runtime/AgentRuntime";
import { SchemaValidator } from "../schema/SchemaValidator";
import { applyPatches } from "./PatchEngine";
import { globalTraceManager } from "../tracing/TraceManager";

export interface ActionOutcome { status: "success" | "failed"; summary: string; reason: string }
export type ResolvedGameEvent = GameEvent & { outcome?: ActionOutcome; audibility?: "normal" | "whisper"; audience?: string[] };
export interface SpeechConstraint { eventId: string; audibility: "normal" | "whisper"; audience: string[] }
export type ActionEffect =
  | { kind: "item_transfer"; entityId: string; from: string; to: string }
  | { kind: "item_consume"; entityId: string }
  | { kind: "actor_move"; entityId: string; from: string; to: string }
  | { kind: "object_state"; entityId: string; field: "open" | "locked" | "loaded" | "lit"; value: boolean };
export interface ActionDecision extends ActionOutcome { eventId: string; effects: ActionEffect[]; grounding?: { kind: "scene_anchor"; description: string; evidence: string } }
export interface ActionResolutionOutput { resolutions: ActionDecision[]; speechConstraints: SpeechConstraint[] }
export interface ActionResolutionResult {
  events: ResolvedGameEvent[];
  /** Internal model decisions for trace/debug only; public consumers use events[].outcome. */
  outcomes: ActionDecision[];
  patches: JsonPatchOperation[];
  world: WorldState;
}

const idSchema = { type: "string", minLength: 1, maxLength: 120 };
const effectSchema = { oneOf: [
  { type: "object", additionalProperties: false, properties: { kind: { const: "item_transfer" }, entityId: idSchema, from: idSchema, to: idSchema }, required: ["kind", "entityId", "from", "to"] },
  { type: "object", additionalProperties: false, properties: { kind: { const: "item_consume" }, entityId: idSchema }, required: ["kind", "entityId"] },
  { type: "object", additionalProperties: false, properties: { kind: { const: "actor_move" }, entityId: idSchema, from: idSchema, to: idSchema }, required: ["kind", "entityId", "from", "to"] },
  { type: "object", additionalProperties: false, properties: { kind: { const: "object_state" }, entityId: idSchema, field: { enum: ["open", "locked", "loaded", "lit"] }, value: { type: "boolean" } }, required: ["kind", "entityId", "field", "value"] },
] };
export const ACTION_ADJUDICATOR: AgentDefinition = {
  id: "action_adjudicator", name: "玩家动作裁决", version: "v1.1",
  description: "在感知与人物反应之前，依据当前世界判定玩家尝试实际成功或失败，输出受限物理效果。",
  messages: [
    { id: "system", role: "system", content: `你是世界内玩家动作裁决器，不是管理员。原始输入和 events 都是尝试，不是已发生事实。依据已有实体、归属、能力、工具状态、世界规则和时间判定每个 action 的结果。输入没有获得修改世界规则、凭空创造物品、瞬移、恢复满属性或强迫NPC执行动作的权限。
只输出 JSON {resolutions:[{eventId,status:"success"|"failed",summary,reason,effects:[]}],speechConstraints:[{eventId,audibility:"normal"|"whisper",audience:[]}]}。每个输入action必须恰好裁决一次，顺序不变。每条speech也必须在speechConstraints裁决一次：普通音量audibility=normal、audience=[]；原始输入或世界明确的贴耳/低声私语audibility=whisper、audience只含真实收听目标ID。普通编译事件可能丢失音量语义，必须回看原始输入和世界说明；不可把口令送给同室所有人。不要在resolutions里重复speech。
summary 是可公开观察的实际结果；reason 是简短公开原因，不泄露任何人物私密状态、幕后规则原文或秘密。失败写尝试未成和实际仍然发生的可见动作，effects必须为空。不要把失败翻译为拒绝服务或管理员命令。
成功也只能发生玩家本人实际完成的步骤：递到面前/放在桌上不等于NPC接过，更不等于吃完。speech里的请求、邀请、假设不触发动作。不要代替NPC接受礼物、吃饭、施法、同意或离开。
effects只允许 item_transfer(entityId,from,to)、item_consume(entityId)、actor_move(entityId,from,to)、object_state(entityId,field,value)。不得输出任意patch，不得修改人物attributes/relationships、clock/scene/rules、创建或删除实体。转移物品必须引用已有实体和真实来源，不能从别人手中直接取物；仅递出时可放在当前地点或现有桌面，不能擅自完成对方接受。已消费物品不能再次使用。消耗只有在足够时间内实际吃完/用完才输出。
当前结构化world.entities中的location、consumed、open、locked、loaded是此刻权威状态，优先于人物背景、场景旧描述和原始输入中的历史归属。背景曾说腰间有物品，不代表如今仍然持有。按events顺序模拟每一步已验证效果，后一步from必须匹配前一步之后的位置；先打开容器再取物应按顺序判断。actor_move只能用于明确移动op，to必须等于该event.target；look、检查、取放物品不得捎带搬动玩家。移动op使用move/move_to/walk/walk_to/enter/leave/go/go_to/run/run_to/travel/travel_to，目的地是已有location。
target可能是场景中已描述、但没有独立entity的桌面等位置锚点，不应因此拒绝合法操作。这样的成功结果须增加grounding:{kind:"scene_anchor",description:该表面描述,evidence:从scene.description或rules逐字引用的直接依据}；实际物品转移to使用当前scene.location，不创建表面实体。没有该依据的不存在对象仍然失败。锚点不能代替工具、物品、人物、钥匙或未知远方地点，不允许用“没有枪”这类否定描述作为已有枪的依据。
已有空枪可以取出、放置；没有实弹不能发射实弹，不能凭空装弹。不存在的物品或能力必须失败，不受玩家声称影响。关闭上锁的对象不能靠口头命令打开；未知钥匙或权限不算有效凭证。移动只能到确实存在且可达的位置，超自然能力必须有已有世界依据。不要硬套现实世界：按本世界支持的科技/魔法和限制判断。
合理但不改变持久物理状态的动作（看、停步、等待、伸手尝试）可success且effects为空。所有实体ID只来自world，eventId只来自events。` },
    { id: "user", role: "user", content: "当前世界：{{json world}}\n本次原始输入：{{playerInput}}\n待裁决的玩家events（action与speech）：{{json events}}" },
  ],
  inputs: [{ name: "world", type: "WorldState", required: true }, { name: "playerInput", type: "string", required: true }, { name: "events", type: "GameEvent[]", required: true }],
  outputSchema: { type: "object", additionalProperties: false, properties: { resolutions: { type: "array", items: { type: "object", additionalProperties: false, properties: { eventId: idSchema, status: { enum: ["success", "failed"] }, summary: { type: "string", minLength: 1, maxLength: 600 }, reason: { type: "string", minLength: 1, maxLength: 600 }, effects: { type: "array", maxItems: 16, items: effectSchema }, grounding: { type: "object", additionalProperties: false, properties: { kind: { const: "scene_anchor" }, description: { type: "string", minLength: 1, maxLength: 240 }, evidence: { type: "string", minLength: 2, maxLength: 600 } }, required: ["kind", "description", "evidence"] } }, required: ["eventId", "status", "summary", "reason", "effects"] } }, speechConstraints: { type: "array", items: { type: "object", additionalProperties: false, properties: { eventId: idSchema, audibility: { enum: ["normal", "whisper"] }, audience: { type: "array", items: idSchema, uniqueItems: true } }, required: ["eventId", "audibility", "audience"] } } }, required: ["resolutions", "speechConstraints"] },
  defaults: { temperature: 0.1, maxTokens: 0 },
};

const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const entity = (world: WorldState, id: string) => own(world.entities, id) ? world.entities[id] : undefined;
const pointer = (id: string) => `/entities/${id.replace(/~/g, "~0").replace(/\//g, "~1")}`;
const operation = (event: GameEvent) => (event.op || "").trim().toLowerCase();
class StaleActionSourceError extends Error {}
const itemId = (event: GameEvent): string | undefined => {
  const value = (event as GameEvent & { item?: unknown }).item ?? event.details?.item ?? event.details?.itemId;
  return typeof value === "string" && value ? value : undefined;
};
function roomOf(world: WorldState, id: string): string | undefined {
  const seen = new Set<string>();
  for (let current: string | undefined = id; current && !seen.has(current); current = entity(world, current)?.location) {
    seen.add(current);
    if (current === world.scene.location) return current;
    if (entity(world, current)?.type === "location") return current;
  }
  return undefined;
}
function reachableItem(world: WorldState, id: string, actor: string): boolean {
  if (roomOf(world, id) !== roomOf(world, actor)) return false;
  const seen = new Set<string>();
  let parent = entity(world, id)?.location;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    if (parent === world.scene.location) return true;
    const container = entity(world, parent);
    if (!container || (container.type === "character" && parent !== actor)) return false;
    if (container.type === "object" && (container.locked === true || container.open === false)) return false;
    parent = container.location;
  }
  return true;
}
function failure(event: GameEvent, reason: string): ActionDecision {
  return { eventId: event.id, status: "failed", summary: `尝试未成功：${reason}`, reason, effects: [] };
}

/** Publish verified physical effects, never freely authored model explanations. */
function publicActionOutcome(decision: ActionDecision, world: WorldState, deterministicFailure: boolean): ActionOutcome {
  if (decision.status === "failed") {
    const reason = deterministicFailure ? decision.reason : "所需对象或条件没有成立";
    return { status: "failed", summary: `尝试未成功：${reason}。`, reason };
  }
  const name = (id: string, fallback: string): string => {
    const value = entity(world, id)?.name;
    return typeof value === "string" && value.trim() ? value : id === "player" ? "玩家" : id === world.scene.location ? "当前场景" : fallback;
  };
  const summaries = decision.effects.map(effect => {
    if (effect.kind === "item_transfer") return `${name(effect.entityId, "该物品")}已从${name(effect.from, "原位置")}移至${name(effect.to, "目标位置")}。`;
    if (effect.kind === "item_consume") return `${name(effect.entityId, "该物品")}已用完。`;
    if (effect.kind === "actor_move") return `${name(effect.entityId, "行动者")}已到达${name(effect.to, "目标地点")}。`;
    const state = { open: effect.value ? "打开" : "关闭", locked: effect.value ? "锁定" : "解锁", loaded: effect.value ? "已装填" : "未装填", lit: effect.value ? "点燃" : "熄灭" }[effect.field];
    return `${name(effect.entityId, "该对象")}的状态已确认为${state}。`;
  });
  return { status: "success", summary: summaries.length ? summaries.join("") : "当前动作尝试已完成；未确认其他物品或状态变化。", reason: "结果仅依据通过校验的动作效果。" };
}
function physicalPrecondition(event: GameEvent, world: WorldState, deferReachability = false): string | undefined {
  const actor = event.actor || "player";
  if (actor !== "player" || entity(world, actor)?.type !== "character") return "玩家动作必须由当前玩家执行";
  const target = event.target;
  const item = itemId(event);
  if (item && entity(world, item)?.type !== "item") return "所需物品不存在";
  const referencedItem = item || (target && entity(world, target)?.type === "item" ? target : undefined);
  if (referencedItem && entity(world, referencedItem)?.consumed === true) return "所需物品已经用完";
  if (!deferReachability && referencedItem && !reachableItem(world, referencedItem, actor)) return "所需物品不在当前可取得的范围内";
  const tool = item ? entity(world, item) : target ? entity(world, target) : undefined;
  if (["shoot", "fire", "fire_weapon"].includes(operation(event)) && tool?.loaded === false) return "工具未装填，无法产生所请求的发射结果";
}

/** Obvious missing references fail in-world before an LLM can promote a claim to fact. */
export function preflightPlayerActions(events: GameEvent[], world: WorldState) {
  const ids = new Set<string>();
  const pending: GameEvent[] = [], rejected: ActionDecision[] = [];
  for (const event of events) {
    if (!event.id || ids.has(event.id)) throw new Error("Action resolution requires unique non-empty event IDs");
    ids.add(event.id);
    if (event.type !== "action") continue;
    // Earlier pending actions can open containers or move the player. Only the
    // sequential validation below may decide later actions' current reachability.
    const reason = physicalPrecondition(event, world, pending.length > 0);
    if (reason) rejected.push(failure(event, reason));
    else pending.push(structuredClone(event));
  }
  return { pending, rejected };
}

/** Invalid model envelopes/effects fail the turn; infeasible user attempts become failed outcomes. */
export function validateActionResolutions(events: GameEvent[], world: WorldState, output: ActionResolutionOutput): ActionResolutionResult {
  SchemaValidator.validateOrThrow(ACTION_ADJUDICATOR.outputSchema!, output);
  const { pending, rejected } = preflightPlayerActions(events, world);
  if (output.resolutions.length !== pending.length || output.resolutions.some((r, i) => r.eventId !== pending[i].id)) throw new Error("Action decisions must cover pending action IDs exactly once in order");
  const speeches = events.filter(event => event.type === "speech");
  if (output.speechConstraints.length !== speeches.length || output.speechConstraints.some((constraint, i) => constraint.eventId !== speeches[i].id)) throw new Error("Speech constraints must cover speech IDs exactly once in order");
  for (const [index, constraint] of output.speechConstraints.entries()) {
    const speech = speeches[index];
    if (constraint.audibility === "normal" && constraint.audience.length) throw new Error("Normal speech must leave its audience unrestricted");
    if (constraint.audibility === "whisper" && (constraint.audience.length !== 1 || constraint.audience[0] !== speech.target || entity(world, constraint.audience[0])?.type !== "character")) throw new Error("Whisper audience must be exactly the existing addressed character");
  }
  let current = structuredClone(world);
  const patches: JsonPatchOperation[] = [];
  const outcomes = new Map(rejected.map(result => [result.eventId, result]));
  const deterministicFailures = new Set(rejected.map(result => result.eventId));
  for (const [index, decision] of output.resolutions.entries()) {
    const event = pending[index];
    if (decision.status === "failed" && decision.effects.length) throw new Error("Failed actions cannot carry physical effects");
    if (decision.status === "success" && event.target && event.target !== "scene" && !entity(current, event.target)) {
      const grounding = decision.grounding;
      const sources = [current.scene.description || "", ...Object.values(current.rules).filter((value): value is string => typeof value === "string")];
      if (!grounding || !sources.some(source => source.includes(grounding.evidence))) throw new Error("Unknown target success requires a scene anchor grounded in existing scene or rules text");
      if (decision.effects.some(effect => effect.kind !== "item_transfer" || effect.to !== current.scene.location)) throw new Error("Unmodeled scene anchors allow only local item placement, not new object state or travel");
    }
    const precondition = physicalPrecondition(event, current);
    if (precondition) { outcomes.set(event.id, failure(event, precondition)); deterministicFailures.add(event.id); continue; }
    const nextPatches: JsonPatchOperation[] = [];
    let candidate = structuredClone(current);
    for (const effect of decision.effects) {
      const target = entity(candidate, effect.entityId);
      if (!target) throw new Error("Action effect references an unknown entity");
      const actor = event.actor || "player", actorRoom = roomOf(candidate, actor);
      const references = new Set([actor, event.target, itemId(event), actorRoom].filter(Boolean));
      if (!references.has(effect.entityId)) throw new Error("Action effect changes an entity unrelated to the attempt");
      if (effect.kind === "item_transfer") {
        const destination = entity(candidate, effect.to) || (effect.to === candidate.scene.location ? { type: "location" as const } : undefined);
        if (target.type !== "item" || target.consumed === true || !destination) throw new Error("Item transfer requires an existing unconsumed item, exact source and destination");
        if (target.location && entity(candidate, target.location)?.type === "character" && target.location !== actor) throw new Error("Cannot take another character's held item without their action");
        if (destination.type === "character" && effect.to !== actor) throw new Error("Offering an item does not authorize another character to accept it");
        if (!reachableItem(candidate, effect.entityId, actor) || roomOf(candidate, effect.to) !== actorRoom) throw new Error("Item transfer must stay within reach of the actor");
        if (destination.type === "object" && (destination.locked === true || destination.open === false)) throw new Error("Cannot put an item inside a closed or locked container");
        let ancestor: string | undefined = effect.to;
        const seen = new Set<string>();
        while (ancestor && !seen.has(ancestor)) {
          if (ancestor === effect.entityId) throw new Error("Item transfer cannot create a containment cycle");
          seen.add(ancestor); ancestor = entity(candidate, ancestor)?.location;
        }
        // Stale ownership is retriable only after all actual physical/authority
        // checks pass. Never infer a new source or apply an unverified effect.
        if (target.location !== effect.from) {
          if (!entity(candidate, effect.from) && effect.from !== candidate.scene.location) throw new Error("Item transfer requires an existing exact source");
          throw new StaleActionSourceError(`Item transfer exact source is stale: eventId=${event.id}, entityId=${effect.entityId}, proposedFrom=${effect.from}, currentFrom=${target.location}`);
        }
        nextPatches.push({ op: "replace", path: `${pointer(effect.entityId)}/location`, value: effect.to });
      } else if (effect.kind === "item_consume") {
        if (target.type !== "item" || target.location !== actor || target.consumed === true) throw new Error("Consumption requires an unconsumed item held by the acting character");
        nextPatches.push({ op: own(target, "consumed") ? "replace" : "add", path: `${pointer(effect.entityId)}/consumed`, value: true });
      } else if (effect.kind === "actor_move") {
        const movementOps = ["move", "move_to", "walk", "walk_to", "enter", "leave", "go", "go_to", "run", "run_to", "travel", "travel_to"];
        if (!movementOps.includes(operation(event)) || effect.to !== event.target) throw new Error("Movement effect must match an explicit movement op and event target");
        if (effect.entityId !== actor || target.type !== "character" || target.location !== effect.from || entity(candidate, effect.to)?.type !== "location") throw new Error("Movement requires the acting player and an existing destination location");
        nextPatches.push({ op: "replace", path: `${pointer(actor)}/location`, value: effect.to });
      } else {
        if (!["item", "object"].includes(target.type) || roomOf(candidate, effect.entityId) !== actorRoom) throw new Error("Object operation must target an existing reachable physical object");
        if (effect.field === "open" && effect.value && target.locked === true) throw new Error("Locked objects cannot be opened without a prior authorized unlock");
        if (effect.field === "locked" && !effect.value && target.locked === true) {
          const key = itemId(event) && entity(candidate, itemId(event)!);
          if (!key || key.location !== actor || key.opens !== effect.entityId) throw new Error("Unlocking requires a held key explicitly valid for this object");
        }
        if (effect.field === "loaded" && effect.value && target.loaded !== true) throw new Error("An action cannot create ammunition by changing loaded state");
        nextPatches.push({ op: own(target, effect.field) ? "replace" : "add", path: `${pointer(effect.entityId)}/${effect.field}`, value: effect.value });
      }
      const applied = applyPatches(current, nextPatches);
      if (!applied.success) throw new Error("Action physical effects failed world invariant validation");
      candidate = applied.newWorld;
    }
    current = candidate;
    patches.push(...nextPatches);
    outcomes.set(event.id, structuredClone(decision));
  }
  return { world: current, patches, outcomes: events.filter(e => e.type === "action").map(e => outcomes.get(e.id)!), events: events.map(event => {
    const speech = output.speechConstraints.find(constraint => constraint.eventId === event.id);
    return { ...structuredClone(event), ...(outcomes.has(event.id) ? { outcome: publicActionOutcome(outcomes.get(event.id)!, current, deterministicFailures.has(event.id)) } : {}), ...(speech ? { audibility: speech.audibility, audience: [...speech.audience] } : {}) };
  }) };
}

export async function resolvePlayerActions(events: GameEvent[], world: WorldState, playerInput: string, options: Omit<RunAgentOptions, "agentId" | "context">): Promise<ActionResolutionResult> {
  const { pending } = preflightPlayerActions(events, world);
  const pendingIds = new Set(pending.map(event => event.id));
  const modelEvents = events.filter(event => event.type === "speech" || pendingIds.has(event.id));
  if (!modelEvents.length) return validateActionResolutions(events, world, { resolutions: [], speechConstraints: [] });
  const protocol = buildActionProtocolInstructions(modelEvents);
  let feedback = "";
  let staleOriginal: ActionResolutionOutput | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Own the complete retry bound here; do not multiply it by the runtime's JSON retry.
    const result = await agentRuntime.runAgent<ActionResolutionOutput>({ ...options, formatRetryAttempt: 1, agentId: ACTION_ADJUDICATOR.id, instructions: [options.instructions, protocol, feedback].filter(Boolean).join("\n"), context: { world, playerInput, events: modelEvents } });
    const traceId = options.traceId;
    const validationId = `${result.spanId}_action_resolution_validation`;
    const tracing = !!traceId && globalTraceManager.isActiveTrace(traceId);
    if (tracing) globalTraceManager.createSpan(traceId!, validationId, "Action protocol and physical validation", "action_resolution_validation", result.spanId, undefined, options.blockId, options.blockIndex);
    try {
      if (!result.success) throw new Error(result.error || "Action adjudicator did not produce a result");
      if (staleOriginal) {
        const effectScope = (effect: ActionEffect) => effect.kind === "item_transfer" ? [effect.kind, effect.entityId, effect.to]
          : effect.kind === "actor_move" ? [effect.kind, effect.entityId, effect.from, effect.to]
          : effect.kind === "object_state" ? [effect.kind, effect.entityId, effect.field, effect.value] : [effect.kind, effect.entityId];
        for (const original of staleOriginal.resolutions) {
          const corrected = result.data.resolutions?.find(decision => decision.eventId === original.eventId);
          if (!corrected || (original.status === "failed" && corrected.status !== "failed") ||
              (corrected.status === "success" && JSON.stringify(corrected.effects.map(effectScope)) !== JSON.stringify(original.effects.map(effectScope)))) throw new Error("Stale source retry cannot change action effect scope or promote failed attempts");
        }
        const speechScope = (constraint: SpeechConstraint) => [constraint.eventId, constraint.audibility, constraint.audience];
        if (JSON.stringify(result.data.speechConstraints.map(speechScope)) !== JSON.stringify(staleOriginal.speechConstraints.map(speechScope))) throw new Error("Stale source retry cannot change speech audience");
      }
      const validated = validateActionResolutions(events, world, result.data);
      if (tracing) globalTraceManager.updateSpan(traceId!, validationId, { status: "success", inputContext: { attempt }, parsedOutput: { outcomes: validated.outcomes, patches: validated.patches } });
      return validated;
    } catch (error: any) {
      const message = error?.message || String(error);
      if (tracing) globalTraceManager.updateSpan(traceId!, validationId, { status: "error", error: message, inputContext: { attempt }, parsedOutput: result.success ? { rejectedOutput: result.data } : undefined });
      const original = traceId ? globalTraceManager.getTrace(traceId)?.spans.find(span => span.id === result.spanId) : undefined;
      const jsonShaped = typeof original?.liveContent === "string" && /^(?:```(?:json)?\s*)?[{\[]/i.test(original.liveContent.trim());
      const staleSource = error instanceof StaleActionSourceError;
      const protocolError = staleSource || /Output Schema Validation Failed|Action decisions must cover|Speech constraints must cover|Normal speech must leave|Whisper audience must be exactly/i.test(message) || (/Output schema expects JSON/i.test(message) && jsonShaped);
      if (attempt !== 0 || !protocolError || options.signal?.aborted) throw error;
      if (staleSource) staleOriginal = structuredClone(result.data);
      feedback = `协议纠正重试（唯一一次，原输出已保留，尚未执行任何动作）：上次输出未通过协议检查：${message.slice(0, 800)}。重新完成同一裁决，保持原始输入、实体、归属、规则与权限不变。${staleSource ? "当前结构化实体及本次先前步骤之后的位置优先于背景旧归属。重新核对整个动作的真实来源；程序没有替你改from值。只能修正过期来源，目标与动作范围不可扩大；锁定、不可达或别人持有的物品仍不得移动。" : "只能修正JSON形状、事件分组、kind字段或audibility/audience协议；"}不能把失败动作改成成功以绕过边界，不得新增物品、权限、NPC行为或扩大私语接收者。普通音量audience=[]。如果本来就不能完成，仍输出failed与空effects。`;
      if (tracing) {
        const retryId = `${result.spanId}_action_protocol_retry`;
        globalTraceManager.createSpan(traceId!, retryId, "One bounded action protocol retry", "action_protocol_retry", validationId, undefined, options.blockId, options.blockIndex);
        globalTraceManager.updateSpan(traceId!, retryId, { status: "success", inputContext: { attempt: 1, maximumRetries: 1, originalSpanId: result.spanId }, parsedOutput: { originalOutputPreserved: true, retryReason: staleSource ? "stale_source" : "protocol", feedback } });
      }
    }
  }
  throw new Error("Action protocol retry exhausted");
}

export function buildActionProtocolInstructions(events: GameEvent[]): string {
  const actions = events.filter(event => event.type === "action").map(event => event.id);
  const speeches = events.filter(event => event.type === "speech").map(event => ({ eventId: event.id, target: event.target || "" }));
  const authority = "当前结构化world.entities状态优先于背景中的旧归属描述；按events顺序判断已执行效果，后一步from使用前一步之后的位置。actor_move必须匹配event.target与明确移动op：move/move_to/walk/walk_to/enter/leave/go/go_to/run/run_to/travel/travel_to；look或取放物品不能捎带移动玩家。\n";
  return authority + `本次输出硬协议（不得参考其他回合ID）：\nresolutions 只能包含这些 action ID，按顺序恰好一次：${JSON.stringify(actions)}。${actions.length ? "speech事件绝不放进resolutions。" : "本次没有action，resolutions必须精确为 []；不能为speech写success/failed。"}\nspeechConstraints 只能包含这些 speech ID，按顺序恰好一次：${JSON.stringify(speeches)}。${speeches.length ? "普通说话audibility=normal且audience必须精确为[]，不是把target填入audience；仅私语使用whisper且audience只含其target。" : "本次没有speech，speechConstraints必须精确为[]。"}\neffects 的辨别键是 kind（绝不是type/op）。完整字段示例（示例ID是占位符，禁止复制不存在的ID）：\n${JSON.stringify([{ kind: "item_transfer", entityId: "EXISTING_ITEM_ID", from: "CURRENT_OWNER_ID", to: "EXISTING_DESTINATION_ID" }, { kind: "item_consume", entityId: "EXISTING_HELD_ITEM_ID" }, { kind: "actor_move", entityId: "player", from: "CURRENT_LOCATION_ID", to: "EXISTING_LOCATION_ID" }, { kind: "object_state", entityId: "EXISTING_OBJECT_ID", field: "open", value: false }])}\n完整JSON Schema（必须原样遵守字段名称和类型；它不授予任何物理权限）：\n${JSON.stringify(ACTION_ADJUDICATOR.outputSchema)}`;
}

/** Deterministic test double only; real runs always use the selected model and world rules. */
export function mockActionResolution(events: GameEvent[], world: WorldState, playerInput: string): ActionResolutionOutput {
  const { pending } = preflightPlayerActions(events, world);
  let current = structuredClone(world);
  const resolutions: ActionDecision[] = [];
  for (const event of pending) {
    const effects: ActionEffect[] = [];
    const actor = event.actor || "player", op = operation(event);
    const item = itemId(event) || (event.target && entity(current, event.target)?.type === "item" ? event.target : undefined);
    const destination = event.target && entity(current, event.target)?.type !== "character" && event.target !== item ? event.target : roomOf(current, actor);
    if (item && ["put", "put_down", "drop", "give", "offer", "place"].includes(op) && destination) effects.push({ kind: "item_transfer", entityId: item, from: entity(current, item)!.location!, to: destination });
    else if (item && ["take", "pick_up"].includes(op)) effects.push({ kind: "item_transfer", entityId: item, from: entity(current, item)!.location!, to: actor });
    else if (item && ["consume", "eat", "drink"].includes(op)) effects.push({ kind: "item_consume", entityId: item });
    else if (["walk_to", "move_to", "enter"].includes(op) && event.target && entity(current, event.target)?.type === "location") effects.push({ kind: "actor_move", entityId: actor, from: entity(current, actor)!.location!, to: event.target });
    let decision: ActionDecision = { eventId: event.id, status: "success", summary: "玩家完成了当前动作。", reason: "模拟裁决：现有对象与动作条件相符。", effects };
    if (["teleport", "command_self_restore", "resurrect"].includes(op)) decision = failure(event, "模拟世界中没有执行这种特殊能力的依据");
    if (["open", "unlock"].includes(op) && event.target && entity(current, event.target)?.locked) decision = failure(event, "对象已锁定且没有有效解锁凭据");
    try {
      const preview = validateActionResolutions([event], current, { resolutions: [decision], speechConstraints: [] });
      current = preview.world;
      resolutions.push(preview.outcomes[0]);
    } catch { resolutions.push(failure(event, "当前物理状态不允许完成此动作")); }
  }
  return { resolutions, speechConstraints: events.filter(event => event.type === "speech").map(event => {
    const whisper = /私语|耳边|耳语|悄声|低声|whisper/i.test(playerInput) && !!event.target && entity(world, event.target)?.type === "character";
    return { eventId: event.id, audibility: whisper ? "whisper" : "normal", audience: whisper ? [event.target!] : [] };
  }) };
}
