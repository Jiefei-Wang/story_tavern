import { GameEvent, NPCIntent, TemporalBlock } from "../../types";
import { getSafeEventDuration, getSafeIntentDuration } from "../world/TimingEngine";
import { elapsedSecondsForBlock, eventsElapsedSeconds, waitPlanningSeconds } from "./TurnTiming";

export interface ReactionBudget {
  available_time: number; // in seconds
  response_window: boolean;
  trigger_event_ids: string[];
}

/**
 * Computes the reaction time budget available to NPCs in a temporal block.
 * Uses getSafeEventDuration to forbid LLM duration tampering (e.g. 1000s duration).
 */
export function calculateReactionBudget(
  block: TemporalBlock,
  defaultBaseTime: number = 2.0
): ReactionBudget {
  if (block.kind === "wait" || block.responseWindow) {
    const dur = block.kind === "wait" ? waitPlanningSeconds(block) : elapsedSecondsForBlock({ ...block, kind: "wait" });
    return {
      available_time: dur,
      response_window: true,
      trigger_event_ids: [],
    };
  }

  const eventIds: string[] = [];

  if (block.events && block.events.length > 0) {
    for (const ev of block.events) {
      eventIds.push(ev.id);
    }
  }

  const available_time = block.events?.length ? eventsElapsedSeconds(block.events) : defaultBaseTime;

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
  return getSafeEventDuration(event);
}

/**
 * Estimates the duration of an NPC's intended action.
 */
export function estimateIntentDuration(intent: NPCIntent): number {
  return getSafeIntentDuration(intent);
}
