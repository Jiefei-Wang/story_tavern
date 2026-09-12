import { GameEvent, NPCIntent, TemporalBlock } from "../../types";

export interface ReactionBudget {
  available_time: number; // in seconds
  response_window: boolean;
  trigger_event_ids: string[];
}

/**
 * Computes the reaction time budget available to NPCs in a temporal block.
 */
export function calculateReactionBudget(
  block: TemporalBlock,
  defaultBaseTime: number = 2.0
): ReactionBudget {
  if (block.kind === "wait" || block.responseWindow) {
    return {
      available_time: 10.0,
      response_window: true,
      trigger_event_ids: [],
    };
  }

  let maxDuration = 0;
  const eventIds: string[] = [];

  if (block.events && block.events.length > 0) {
    for (const ev of block.events) {
      eventIds.push(ev.id);
      const dur = ev.duration || estimateEventDuration(ev);
      if (dur > maxDuration) {
        maxDuration = dur;
      }
    }
  }

  const available_time = Math.max(defaultBaseTime, maxDuration);

  return {
    available_time,
    response_window: false,
    trigger_event_ids: eventIds,
  };
}

/**
 * Estimates physical action duration in seconds based on action type.
 */
export function estimateEventDuration(event: GameEvent): number {
  if (event.duration && event.duration > 0) return event.duration;

  switch (event.type) {
    case "speech": {
      const len = event.content?.length || 0;
      if (len <= 10) return 1.5;
      if (len <= 30) return 3.0;
      return 6.0;
    }
    case "action": {
      if (event.op?.includes("walk") || event.op?.includes("run")) return 3.0;
      if (event.op?.includes("look") || event.op?.includes("glance")) return 0.5;
      if (event.op?.includes("take") || event.op?.includes("open")) return 1.5;
      return 2.5;
    }
    default:
      return 1.5;
  }
}

/**
 * Estimates the duration of an NPC's intended action.
 */
export function estimateIntentDuration(intent: NPCIntent): number {
  if (intent.duration && intent.duration > 0) return intent.duration;

  if (intent.type === "speech") {
    const len = intent.content?.length || 0;
    if (len <= 10) return 1.5;
    if (len <= 30) return 3.0;
    return 5.0;
  }

  if (intent.type === "action") {
    if (intent.op?.includes("look") || intent.op?.includes("nod")) return 0.8;
    if (intent.op?.includes("walk")) return 3.0;
    return 2.0;
  }

  return 1.0;
}
