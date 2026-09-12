import { GameEvent, NPCIntent } from "../../types";

/**
 * Deterministic estimator for speech duration based on character count.
 * Completely overrides LLM-provided duration for speech to prevent duration cheating.
 * - 1-10 chars: 1.5s
 * - 11-30 chars: 3.0s
 * - 31-80 chars: 5.0s
 * - >80 chars: chars / 5.0s (minimum 1.0s)
 */
export function getSpeechDuration(content?: string): number {
  if (!content || typeof content !== "string") {
    return 1.0;
  }
  const len = content.trim().length;
  if (len === 0) return 1.0;
  if (len <= 10) return 1.5;
  if (len <= 30) return 3.0;
  if (len <= 80) return 5.0;
  return Math.max(1.0, len / 5.0);
}

/**
 * Baseline estimation for standard physical actions.
 */
export function estimateActionDuration(op?: string): number {
  // Default baseline for general RPG physical actions is ~2.0s
  return 2.0;
}

/**
 * Clamps an action duration to prevent extreme cheating (e.g. 0.01s or 1000s).
 * Permitted range is [estimated * 0.5, estimated * 2.0] (1.0s ~ 4.0s).
 */
export function getClampedActionDuration(provided?: number, op?: string): number {
  const estimated = estimateActionDuration(op);
  if (
    typeof provided !== "number" ||
    isNaN(provided) ||
    !isFinite(provided) ||
    provided <= 0
  ) {
    return estimated;
  }
  return Math.min(Math.max(provided, estimated * 0.5), estimated * 2.0);
}

/**
 * Computes a tamper-proof safe duration for an incoming GameEvent from Input Compiler.
 * Prevents malicious or hallucinated durations (e.g. 1000s for a simple "hello") from
 * granting an oversized reaction window to NPCs.
 */
export function getSafeEventDuration(event: GameEvent): number {
  if (event.type === "speech") {
    return getSpeechDuration(event.content);
  }
  if (event.type === "action") {
    return getClampedActionDuration(event.duration, event.op);
  }
  if (event.type === "wait") {
    if (
      typeof event.duration === "number" &&
      !isNaN(event.duration) &&
      isFinite(event.duration) &&
      event.duration > 0
    ) {
      return Math.min(event.duration, 60.0);
    }
    return 5.0;
  }
  return 1.5;
}

/**
 * Computes safe duration for an NPC intent:
 * - Speech: strictly deterministic by content length.
 * - Action: clamped to reasonable range.
 * - Wait: clamped.
 */
export function getSafeIntentDuration(intent: NPCIntent): number {
  if (!intent) return 1.0;
  if (intent.type === "speech") {
    return getSpeechDuration(intent.content);
  }
  if (intent.type === "action") {
    return getClampedActionDuration(intent.duration, intent.op);
  }
  if (intent.type === "wait") {
    if (
      typeof intent.duration === "number" &&
      !isNaN(intent.duration) &&
      isFinite(intent.duration) &&
      intent.duration > 0
    ) {
      return Math.min(intent.duration, 10.0);
    }
    return 1.0;
  }
  return 1.0;
}

/**
 * Deterministic character limit for NPC inner thoughts based on available reaction time.
 * Prevents generating an elaborate 1000-word philosophical essay within a 0.5-second glance.
 */
export function maxThoughtChars(availableTime: number): number {
  if (availableTime <= 0.5) return 20;
  if (availableTime <= 2.0) return 80;
  if (availableTime <= 5.0) return 150;
  return 300;
}

/**
 * Safely bounds thought length for world resolution / private state, while preserving
 * raw thought in tracing.
 */
export function sanitizeThoughtBudget(thought: string | null | undefined, availableTime: number): string | null {
  if (!thought || typeof thought !== "string") return null;
  const limit = maxThoughtChars(availableTime);
  const trimmed = thought.trim();
  if (trimmed.length <= limit) return trimmed;
  return trimmed.slice(0, limit) + "...";
}
