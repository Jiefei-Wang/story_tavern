import { CommittedTurnEvent, NarratorResult } from "../../types";
import { PipelineStageError } from "../errors/PipelineStageError";

// A regex cannot prove that arbitrary natural language contains no invented speech.
// Use a closed connective vocabulary; all substantive events come from event_ref.
export const NARRATION_TEXTS = ["", "片刻之间。", "随后。", "与此同时。"];
export const NARRATOR_SCHEMA = {
  type: "object", required: ["segments"], additionalProperties: false,
  properties: { segments: { type: "array", items: { oneOf: [
    { type: "object", required: ["type", "text"], additionalProperties: false,
      properties: { type: { const: "narration" }, text: { type: "string", enum: NARRATION_TEXTS } } },
    { type: "object", required: ["type", "eventId"], additionalProperties: false,
      properties: { type: { const: "event_ref" }, eventId: { type: "string", minLength: 1 } } },
  ] } } },
};

export function validateNarratorStructure(data: any): asserts data is NarratorResult {
  const fail = (message: string): never => { throw new PipelineStageError("narrator", message); };
  if (!data || !Array.isArray(data.segments)) fail("Narrator must return segments");
  for (const segment of data.segments) {
    if (segment?.type === "narration") {
      if (typeof segment.text !== "string" || /[“”"「」『』‘’]/u.test(segment.text)) fail("Direct dialogue in narration is forbidden");
      if (!NARRATION_TEXTS.includes(segment.text)) fail("Narration must use an approved connective; substantive facts require event_ref");
    } else if (segment?.type !== "event_ref" || typeof segment.eventId !== "string" || !segment.eventId) {
      fail("Invalid narrator segment");
    }
  }
}

export function renderNarratorSegments(data: unknown, events: CommittedTurnEvent[]): string {
  validateNarratorStructure(data);
  const map = new Map(events.filter(e => e.public === true).map(e => [e.id, e]));
  const used = new Set<string>();
  return data.segments.map(segment => {
    if (segment.type === "narration") return segment.text;
    const event = map.get(segment.eventId);
    if (!event || used.has(segment.eventId)) throw new PipelineStageError("narrator", `Unknown or duplicate event_ref '${segment.eventId}'`);
    used.add(segment.eventId);
    if (event.type === "npc_speech" || event.type === "player_speech") return `${event.actor}：“${event.content || ""}”`;
    // Non-speech strings are data, never a channel for free-form dialogue.
    if (event.type === "admin_change") {
      const weather: Record<string, string> = { snowy: "雪花纷纷落下。", stormy: "风雨骤起。", clear: "天空放晴。" };
      const changes = (event.patches || []).flatMap(p => {
        if (p.path === "/scene/weather" && typeof p.value === "string" && weather[p.value]) return [weather[p.value]];
        if (p.op === "add" && /^\/entities\/[^/]+$/.test(p.path) && (p.value as any)?.type === "character") return ["场景中多了一名人物。"];
        return [];
      });
      return changes.join("\n\n") || "世界状态已发生变化。";
    }
    if (event.type === "time_skip") return "时间流逝了。";
    if (event.type === "wait") return "你静候片刻。";
    const actions: Record<string, string> = { glance_around: "环顾四周。", shift_posture_and_watch: "调整站姿，注视着现场。", watch_player: "注视着你。", walk_to: "迈步走向目标。", nod: "点了点头。" };
    if (event.op && actions[event.op]) return `${event.actor || "现场的人"}${actions[event.op]}`;
    return event.type === "environment" ? "周围的环境发生了变化。" : `${event.actor || "现场的人"}做出了动作。`;
  }).filter(Boolean).join("\n\n");
}
