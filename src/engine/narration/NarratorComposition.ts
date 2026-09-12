import { CommittedTurnEvent, NarratorResult, SpeechPlan } from "../../types";
import { PipelineStageError } from "../errors/PipelineStageError";

/** Structured output for the literary surface layer. */
export const NARRATOR_SCHEMA = {
  type: "object", required: ["segments"], additionalProperties: false,
  properties: { segments: { type: "array", items: { oneOf: [
    { type: "object", required: ["type", "text"], additionalProperties: false,
      properties: { type: { const: "prose" }, text: { type: "string", minLength: 1 }, sourceEventIds: { type: "array", items: { type: "string", minLength: 1 } } } },
    { type: "object", required: ["type", "sourceIntentId", "text"], additionalProperties: false,
      properties: { type: { const: "speech" }, sourceIntentId: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1 } } },
    // Legacy custom-agent compatibility. Built-in instructions always emit
    // prose/speech and the renderer still applies public-event checks.
    { type: "object", required: ["type", "text"], additionalProperties: false, properties: { type: { const: "narration" }, text: { type: "string" } } },
    { type: "object", required: ["type", "eventId"], additionalProperties: false, properties: { type: { const: "event_ref" }, eventId: { type: "string", minLength: 1 } } },
  ] } } },
};

function speechPlanIsValid(plan: unknown): plan is SpeechPlan {
  if (!plan || typeof plan !== "object" || typeof (plan as SpeechPlan).summary !== "string" || !(plan as SpeechPlan).summary.trim()) return false;
  const value = plan as SpeechPlan;
  return !value.beats || (Array.isArray(value.beats) && value.beats.every((beat) => beat && typeof beat.meaning === "string" && beat.meaning.trim()));
}

export function validateNarratorStructure(data: any): asserts data is NarratorResult {
  const fail = (message: string): never => { throw new PipelineStageError("narrator", message); };
  if (!data || !Array.isArray(data.segments)) fail("Narrator must return segments");
  for (const segment of data.segments) {
    if (segment?.type === "prose") {
      if (typeof segment.text !== "string" || !segment.text.trim()) fail("Prose segments must contain text");
      if (segment.sourceEventIds !== undefined && (!Array.isArray(segment.sourceEventIds) || segment.sourceEventIds.some((id: unknown) => typeof id !== "string" || !id))) fail("Invalid prose sourceEventIds");
    } else if (segment?.type === "speech") {
      if (typeof segment.sourceIntentId !== "string" || !segment.sourceIntentId.trim() || typeof segment.text !== "string" || !segment.text.trim()) fail("Speech segments require sourceIntentId and text");
    } else if (segment?.type === "narration") {
      // Kept solely for old saved/custom output. New agent schemas cannot emit it.
      if (typeof segment.text !== "string" || /[“”"「」『』]/u.test(segment.text) || /(?:说道|说：|说:|回答|问道|says?:|answers?:)/iu.test(segment.text)) fail("Direct dialogue in narration is forbidden");
    } else if (segment?.type !== "event_ref" || typeof segment.eventId !== "string" || !segment.eventId) {
      fail("Invalid narrator segment");
    }
  }
}

export interface NarratorRenderResult { text: string; realizedByIntent: Record<string, string[]>; }

function renderLegacyEvent(event: CommittedTurnEvent): string {
  const outcome = (event as CommittedTurnEvent & { outcome?: { status: string } }).outcome;
  if (outcome?.status === "failed") return `${event.actor || "现场的人"}的尝试未能完成。`;
  if (event.type === "player_action" && outcome?.status !== "success") return `${event.actor || "玩家"}尝试采取行动。`;
  if (event.type === "npc_speech" || event.type === "player_speech") return `${event.actor}：“${event.content || ""}”`;
  if (event.type === "admin_change") return "世界状态已发生变化。";
  if (event.type === "time_skip") return "时间流逝了。";
  if (event.type === "wait") return "你静候片刻。";
  const actions: Record<string, string> = { glance_around: "环顾四周。", shift_posture_and_watch: "调整站姿，注视着现场。", watch_player: "注视着你。", walk_to: "迈步走向目标。", nod: "点了点头。" };
  if (event.op && actions[event.op]) return `${event.actor || "现场的人"}${actions[event.op]}`;
  return event.type === "environment" ? "周围的环境发生了变化。" : `${event.actor || "现场的人"}做出了动作。`;
}

export function renderNarratorSegments(data: unknown, events: CommittedTurnEvent[]): string {
  return renderNarratorSegmentsDetailed(data, events).text;
}

export function renderNarratorSegmentsDetailed(data: unknown, events: CommittedTurnEvent[]): NarratorRenderResult {
  validateNarratorStructure(data);
  const publicEvents = events.filter((event) => event.public === true);
  const succeeded = (event: CommittedTurnEvent) => (event as CommittedTurnEvent & { outcome?: { status: string } }).outcome?.status !== "failed";
  const byIntent = new Map(publicEvents.filter((event) => event.sourceIntentId && succeeded(event)).map((event) => [event.sourceIntentId!, event]));
  const byEventId = new Map(publicEvents.map((event) => [event.id, event]));
  const realizedByIntent: Record<string, string[]> = {};
  const legacyUsed = new Set<string>();
  const rendered = data.segments.map((segment: any) => {
    if (segment.type === "prose" || segment.type === "narration") {
      if (segment.sourceEventIds) for (const id of segment.sourceEventIds) if (!byEventId.has(id)) throw new PipelineStageError("narrator", `Unknown prose source event '${id}'`);
      return segment.text;
    }
    if (segment.type === "speech") {
      const event = byIntent.get(segment.sourceIntentId);
      if (!event || (event.type !== "npc_speech" && event.type !== "player_speech")) throw new PipelineStageError("narrator", `Unknown or non-speech sourceIntentId '${segment.sourceIntentId}'`);
      if (event.type === "npc_speech" && !speechPlanIsValid(event.speechPlan)) throw new PipelineStageError("narrator", `Speech event '${segment.sourceIntentId}' is missing its SpeechPlan`);
      (realizedByIntent[segment.sourceIntentId] ||= []).push(segment.text.trim());
      return `“${segment.text.trim()}”`;
    }
    const event = byEventId.get(segment.eventId);
    if (!event || legacyUsed.has(segment.eventId)) throw new PipelineStageError("narrator", `Unknown or duplicate event_ref '${segment.eventId}'`);
    legacyUsed.add(segment.eventId);
    if (event.sourceIntentId) (realizedByIntent[event.sourceIntentId] ||= []).push(event.content || "");
    return renderLegacyEvent(event);
  }).filter((text: string) => text.length > 0);
  for (const event of publicEvents) {
    if (event.type === "npc_speech" && succeeded(event) && event.sourceIntentId && !(realizedByIntent[event.sourceIntentId] || []).length) throw new PipelineStageError("narrator", `Accepted speech intent '${event.sourceIntentId}' was not realized`);
  }
  for (const event of publicEvents) if (event.sourceIntentId && realizedByIntent[event.sourceIntentId]) event.realizedText = [...realizedByIntent[event.sourceIntentId]];
  return { text: rendered.join("\n\n"), realizedByIntent };
}
