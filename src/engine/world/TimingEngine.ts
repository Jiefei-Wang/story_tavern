import { GameEvent, NPCIntent, SpeechPlan } from "../../types";

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

/** Estimate speech time from semantic intent, before Narrator has written words. */
export function getSpeechPlanDuration(plan?: SpeechPlan): number {
  if (!plan || typeof plan !== "object") return 1.5;
  // Summary describes the utterance; beats/tone/goal describe how to realize it.
  // Counting both counted the same reply twice and punished descriptive metadata.
  const semanticText = typeof plan.summary === "string" ? plan.summary.trim() : "";
  const verbosityMultiplier: Record<NonNullable<SpeechPlan["verbosity"]>, number> = {
    brief: 0.6,
    normal: 1,
    detailed: 1.35,
    extended: 1.8,
  };
  const summaryChars = [...semanticText].filter(char => /[\p{L}\p{N}]/u.test(char)).length;
  const base = Math.max(1.5, summaryChars / 5);
  // A terse summary cannot hide arbitrarily many mandatory points. Charge per
  // distinct obligation, not for the length of its explanatory metadata.
  const requiredPoints = new Set((plan.beats || []).filter(beat => beat.required === true).map(beat => beat.meaning.trim())).size;
  return Math.max(1.5, requiredPoints * 0.6, base * (plan.verbosity ? verbosityMultiplier[plan.verbosity] : 1));
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
 * - Brief action: clamped to reasonable range.
 * - Sustained process: preserves its requested duration when a trusted window is
 *   supplied. Over-budget duration is returned intact so scheduling rejects the
 *   intent instead of describing a twenty-minute rest as completed in a second.
 * - Wait: clamped.
 */
export function getSafeIntentDuration(intent: NPCIntent, availableTime?: number): number {
  if (!intent) return 1.0;
  if (intent.type === "speech") {
    return intent.speechPlan ? getSpeechPlanDuration(intent.speechPlan) : getSpeechDuration(intent.content);
  }
  if (intent.type === "action") {
    if (typeof availableTime === "number" && Number.isFinite(availableTime) && availableTime >= 0 &&
      isSustainedProcessAction(intent.op) && typeof intent.duration === "number" &&
      Number.isFinite(intent.duration) && intent.duration > 0) {
      return Math.max(1, intent.duration);
    }
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

/** Activity categories only; no scene, character, item or attribute IDs. */
export function isSustainedProcessAction(op?: string): boolean {
  if (!op) return false;
  const normalized = op.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  if (words.some(word => ["ask", "offer", "invite", "plan", "promise", "request", "describe", "pretend", "agree"].includes(word)) ||
    /请求|邀请|打算|承诺|假装|描述|答应/.test(normalized)) return false;
  return words.some(word => ["rest", "sleep", "nap", "eat", "drink", "consume", "meditate", "recover", "recuperate"].includes(word)) ||
    /休息|睡眠|睡觉|小睡|进食|吃饭|喝水|冥想|静养/.test(normalized);
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
