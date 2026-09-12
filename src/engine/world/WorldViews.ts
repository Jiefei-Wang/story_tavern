import {
  GameEvent,
  JsonPatchOperation,
  NPCObservation,
  PerceptionResult,
  PublicWorldEvent,
  WorldEntity,
  WorldState,
} from "../../types";
import { PipelineStageError } from "../errors/PipelineStageError";

/**
 * Checks if a JSON pointer path targets private NPC state that must never
 * be leaked to the Narrator or other unprivileged agents.
 *
 * Targets:
 * - /entities/{id}/mentalState/**
 * - /entities/{id}/memory/**
 * - /entities/{id}/relationships/**
 * - /entities/{id}/goal/**
 */
export function isPrivateWorldPath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  const privateRegex = /^\/entities\/[^/]+\/(mentalState|memory|relationships|goal)(\/.*)?$/;
  return privateRegex.test(path);
}

/**
 * Filters patches so only public world changes (clock, scene, physical location, open/locked status)
 * are exposed to the Narrator.
 */
export function filterPublicPatches(patches: JsonPatchOperation[]): JsonPatchOperation[] {
  if (!Array.isArray(patches)) return [];
  return patches.filter((p) => !isPrivateWorldPath(p.path));
}

/**
 * Builds the isolated view of the world passed to the Perception Agent.
 * Only includes physical scene parameters and observable entity properties.
 * Strictly excludes memory, goal, relationships, mentalState, and private flags.
 */
export function buildPerceptionView(world: WorldState): {
  scene: { location: string; weather: string; lighting: string };
  entities: Record<
    string,
    {
      id: string;
      name?: string;
      type: string;
      location?: string;
      open?: boolean;
      locked?: boolean;
    }
  >;
} {
  const safeEntities: Record<string, any> = {};

  for (const [id, ent] of Object.entries(world.entities || {})) {
    safeEntities[id] = {
      id,
      name: ent.name,
      type: ent.type,
      location: ent.location,
      ...(ent.open !== undefined ? { open: ent.open } : {}),
      ...(ent.locked !== undefined ? { locked: ent.locked } : {}),
    };
  }

  return {
    scene: {
      location: world.scene.location,
      weather: world.scene.weather,
      lighting: world.scene.lighting,
    },
    entities: safeEntities,
  };
}

/**
 * Builds the isolated view of the world passed to the Narrator Agent.
 * Public physical attributes only. Excludes all private internal states.
 */
export function buildNarratorEntityView(world: WorldState): Record<
  string,
  {
    id: string;
    name?: string;
    type: string;
    location?: string;
    open?: boolean;
    locked?: boolean;
  }
> {
  const safeEntities: Record<string, any> = {};

  for (const [id, ent] of Object.entries(world.entities || {})) {
    safeEntities[id] = {
      id,
      name: ent.name,
      type: ent.type,
      location: ent.location,
      ...(ent.open !== undefined ? { open: ent.open } : {}),
      ...(ent.locked !== undefined ? { locked: ent.locked } : {}),
    };
  }

  return safeEntities;
}

/**
 * Builds the isolated context for a specific NPC.
 * The NPC receives only:
 * - Its own full state (mentalState, relationships, goal, memory, location, etc.)
 * - Sanitized observations for this NPC
 * - Public scene context
 * - Reaction budget
 * Does NOT leak other NPCs' private goals, memories, or mental states!
 */
export function buildNpcView(
  world: WorldState,
  npcId: string,
  sanitizedObservations: NPCObservation[],
  budget: { available_time: number; response_window: boolean; trigger_event_ids?: string[] }
): {
  npc: WorldEntity & { id: string };
  observations: NPCObservation[];
  scene: { location: string; weather: string; lighting: string; description?: string };
  reaction: typeof budget;
} {
  const rawNpc = world.entities[npcId] || { type: "character" };
  const ownNpc: WorldEntity & { id: string } = {
    ...rawNpc,
    id: npcId,
  };

  return {
    npc: ownNpc,
    observations: sanitizedObservations,
    scene: {
      location: world.scene.location,
      weather: world.scene.weather,
      lighting: world.scene.lighting,
      description: world.scene.description,
    },
    reaction: budget,
  };
}

/**
 * Sanitizes NPC observations to guarantee finite perspective:
 * 1. Only keeps observations where saw === true || heard === true (drops saw=false && heard=false).
 * 2. Validates that eventId actually exists in the current block events.
 * 3. If event.type === 'speech':
 *    - If heard === true: content is taken authoritatively from the real GameEvent.
 *    - If heard === false: content is deleted/omitted so speech content is not leaked!
 * 4. If event.type !== 'speech': speech content is omitted.
 */
export function sanitizeNpcObservations(
  npcId: string,
  observations: NPCObservation[] = [],
  events: GameEvent[] = []
): NPCObservation[] {
  if (!Array.isArray(observations) || observations.length === 0) {
    return [];
  }

  const eventMap = new Map<string, GameEvent>();
  for (const ev of events) {
    eventMap.set(ev.id, ev);
  }

  const sanitized: NPCObservation[] = [];

  for (const obs of observations) {
    // 1. Drop records where saw=false && heard=false
    if (!obs.saw && !obs.heard) {
      continue;
    }

    // 2. eventId must exist in current block events
    const realEvent = eventMap.get(obs.eventId);
    if (!realEvent) {
      continue;
    }

    const cleanObs: NPCObservation = {
      eventId: obs.eventId,
      saw: Boolean(obs.saw),
      heard: Boolean(obs.heard),
    };

    // 3. Speech privacy: content is only retained if heard === true, from authoritative GameEvent
    if (realEvent.type === "speech") {
      if (cleanObs.heard) {
        cleanObs.content = realEvent.content || obs.content || "";
      }
    }

    sanitized.push(cleanObs);
  }

  return sanitized;
}

/**
 * Validates that all observations emitted by Perception reference known eventIds.
 * Throws a PipelineStageError if any unknown eventId is found.
 */
export function validatePerceptionAgainstEvents(
  perceptionResult: PerceptionResult,
  events: GameEvent[]
): void {
  if (!perceptionResult?.npcObservations) return;

  const validEventIds = new Set(events.map((e) => e.id));

  for (const [npcId, obsList] of Object.entries(perceptionResult.npcObservations)) {
    if (!Array.isArray(obsList)) continue;
    for (const obs of obsList) {
      if (!validEventIds.has(obs.eventId)) {
        throw new PipelineStageError(
          "perception",
          `Perception Agent produced observation for unknown eventId '${obs.eventId}' on NPC '${npcId}'`
        );
      }
    }
  }
}

/**
 * Validates that publicEvents produced by World Resolver conform to the contract.
 * Actor must exist or be 'player'/'world'/'environment'/'scene'.
 * Type must be 'action' | 'speech' | 'environment'.
 * Speech content must be a non-empty string.
 * Duration must be a finite non-negative number if supplied.
 */
export function validatePublicEvents(
  publicEvents: PublicWorldEvent[] | undefined,
  world: WorldState
): void {
  if (!publicEvents || !Array.isArray(publicEvents)) return;

  const validSystemActors = new Set(["player", "world", "environment", "scene"]);

  for (const ev of publicEvents) {
    if (!ev || typeof ev !== "object") {
      throw new PipelineStageError("world_resolver", "Invalid public event: must be an object");
    }

    // Actor check
    if (!ev.actor || typeof ev.actor !== "string") {
      throw new PipelineStageError("world_resolver", "Public event missing valid actor");
    }

    const actorLower = ev.actor.toLowerCase();
    const actorExists =
      validSystemActors.has(actorLower) ||
      Boolean(world.entities[ev.actor]) ||
      Boolean(world.entities[actorLower]);

    if (!actorExists) {
      throw new PipelineStageError(
        "world_resolver",
        `Public event has non-existent actor: '${ev.actor}'`
      );
    }

    // Type check
    if (ev.type !== "action" && ev.type !== "speech" && ev.type !== "environment") {
      throw new PipelineStageError(
        "world_resolver",
        `Public event has invalid type: '${ev.type}' (expected action, speech, or environment)`
      );
    }

    // Speech content check
    if (ev.type === "speech") {
      if (typeof ev.content !== "string" || ev.content.trim() === "") {
        throw new PipelineStageError(
          "world_resolver",
          `Public speech event by actor '${ev.actor}' must have non-empty content`
        );
      }
    }

    // Duration check
    if (ev.duration !== undefined) {
      if (typeof ev.duration !== "number" || isNaN(ev.duration) || !isFinite(ev.duration) || ev.duration < 0) {
        throw new PipelineStageError(
          "world_resolver",
          `Public event by actor '${ev.actor}' has invalid duration: ${ev.duration}`
        );
      }
    }
  }
}
