import { interactionFor } from "./ConversationRouter";
import * as jsonpatch from 'fast-json-patch';
import {
  GameEvent,
  JsonPatchOperation,
  NPCObservation,
  NPCIntent,
  PerceptionResult,
  PublicWorldEvent,
  WorldEntity,
  WorldState,
} from "../../types";
import { PipelineStageError } from "../errors/PipelineStageError";

import { CharacterSchemaDefinition } from "../../types";
import { HARBOR_WORLD_DEFINITION } from "../character-schema/HarborSchema";
import { buildCharacterSchemaPrompt, characterFields, getPublicCharacterFields } from "../character-schema/CharacterSchema";
const defaultSchema = HARBOR_WORLD_DEFINITION.characterSchema;
const decode = (p: string) => p.split('/').slice(1).map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'));

export function isPrivateWorldPath(path: string, schema: CharacterSchemaDefinition = defaultSchema): boolean {
  const parts = decode(path);
  if (parts[0] !== 'entities') return !['clock','scene'].includes(parts[0]);
  if (parts.length <= 2) return false;
  if (['type','name','location','open','locked'].includes(parts[2])) return parts.length !== 3;
  let fields = characterFields(schema), offset = 3;
  if (parts[2] === 'relationships') { if (!schema.relationship) return true; fields = schema.relationship.fields; offset = 4; }
  else if (parts[2] !== 'attributes') return true;
  if (parts.length <= offset) return true; // Ambiguous container: fail closed; whole-entity values are projected below.
  for (let i = offset; i < parts.length; i++) {
    const f = fields.find(f => f.id === parts[i]);
    if (!f || f.visibility === 'private') return true;
    if (f.type === 'object') { if (i === parts.length - 1) return true; fields = f.fields!; }
    else if (f.type === 'list') return true; // Public list changes are represented by projected world diff when available.
    else if (i !== parts.length - 1) return true;
  }
  return false;
}

export function publicEntity(ent: WorldEntity, schema: CharacterSchemaDefinition = defaultSchema) {
  return { ...Object.fromEntries(['type','name','location', ...(ent.type === 'character' ? [] : ['open','locked','loaded','consumed','lit'])]
    .filter(key => ent[key] !== undefined).map(key => [key, ent[key]])),
    ...(ent.type === 'character' ? getPublicCharacterFields(ent, schema) : {}) };
}

export function filterPublicPatches(patches: JsonPatchOperation[], schema: CharacterSchemaDefinition = defaultSchema, before?: WorldState, after?: WorldState): JsonPatchOperation[] {
  if (before && after) {
    const compare = (jsonpatch as any).default?.compare || (jsonpatch as any).compare;
    const project = (world: WorldState) => ({ clock: world.clock, scene: world.scene, entities: buildNarratorEntityView(world, schema) });
    return compare(project(before), project(after));
  }
  if (!Array.isArray(patches)) return [];
  return patches.filter(p => !isPrivateWorldPath(p.path, schema) && !p.from).map(p => {
    if (/^\/entities\/[^/]+$/.test(p.path) && p.value && typeof p.value === 'object') return { ...p, value: publicEntity(p.value as WorldEntity, schema) };
    if (p.path === '/entities' && p.value && typeof p.value === 'object') return { ...p, value: Object.fromEntries(Object.entries(p.value).map(([id,e]) => [id, publicEntity(e as WorldEntity, schema)])) };
    return p;
  });
}

export function buildPerceptionView(world: WorldState, schema: CharacterSchemaDefinition = defaultSchema) {
  return { scene: { location: world.scene.location, weather: world.scene.weather, lighting: world.scene.lighting }, entities: buildNarratorEntityView(world, schema) };
}
export function buildNarratorEntityView(world: WorldState, schema: CharacterSchemaDefinition = defaultSchema): Record<string, any> {
  return Object.fromEntries(Object.entries(world.entities || {}).map(([id, ent]) => [id, { id, ...publicEntity(ent, schema) }]));
}

/**
 * Builds the isolated context for a specific NPC.
 * The NPC receives only:
 * - Its own schema-defined public/private state
 * - Sanitized observations for this NPC
 * - Public scene context
 * - Reaction budget
 * Does NOT leak other NPCs' private goals, memories, or mental states!
 */
export function buildNpcView(
  world: WorldState,
  npcId: string,
  sanitizedObservations: NPCObservation[],
  budget: { available_time: number; response_window: boolean; trigger_event_ids?: string[] },
  events: GameEvent[] = [],
  schema: CharacterSchemaDefinition = defaultSchema
): {
  characterSchemaPrompt: string;
  npc: WorldEntity & { id: string };
  observations: NPCObservation[];
  scene: { location: string; weather: string; lighting: string; description?: string };
  reaction: typeof budget;
  interaction: import("../../types").InteractionContext;
  visibleObjects: Record<string, unknown>;
} {
  const rawNpc = world.entities[npcId] || { type: "character" };
  const ownNpc: WorldEntity & { id: string } = {
    ...rawNpc,
    id: npcId,
  };

  return {
    characterSchemaPrompt: buildCharacterSchemaPrompt(schema),
    npc: ownNpc,
    observations: sanitizedObservations,
    scene: {
      location: world.scene.location,
      weather: world.scene.weather,
      lighting: world.scene.lighting,
    },
    reaction: budget,
    interaction: interactionFor(npcId, events),
    visibleObjects: Object.fromEntries(Object.entries(world.entities).filter(([,e]) => e.type !== 'character' && (e.location === npcId || e.location === rawNpc.location)).map(([id,e]) => [id, publicEntity(e,schema)])),
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
    // A probabilistic perception model cannot grant access beyond the adjudicated audience.
    if (realEvent.type === 'speech' && realEvent.audibility === 'whisper' && !(realEvent.audience || [realEvent.target]).includes(npcId)) cleanObs.heard = false;
    if (!cleanObs.saw && !cleanObs.heard) continue;

    // Perception may decide visibility, but it may not rewrite event meaning.
    // Copy only the semantic fields that are actually observable on the
    // authoritative event. This gives NPC Reaction enough context without
    // leaking private state from the world.
    if (cleanObs.saw || cleanObs.heard) {
      cleanObs.actor = realEvent.actor;
      cleanObs.type = realEvent.type;
      cleanObs.op = realEvent.op;
      cleanObs.target = realEvent.target;
      cleanObs.duration = realEvent.duration;
      if (realEvent.outcome) cleanObs.outcome = structuredClone(realEvent.outcome);
    }

    // 3. Speech privacy: content is only retained if heard === true, from authoritative GameEvent
    if (realEvent.type === "speech") {
      if (cleanObs.heard) {
        cleanObs.content = realEvent.content || "";
      }
    }
    // A validated, visible listening request gives only its addressee the request
    // meaning. Keep type=action: this is never a claim that the player spoke it.
    if (realEvent.type === 'action' && realEvent.op === 'listen_to' && realEvent.details?.responseRequested === true &&
      realEvent.target === npcId && cleanObs.saw && realEvent.outcome?.status === 'success') {
      cleanObs.content = realEvent.responseRequest?.sourceText;
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
 * Speech must carry a non-empty SpeechPlan (legacy content is accepted only
 * by direct migration callers).
 * Duration must be a finite non-negative number if supplied.
 */
export function validatePublicEvents(
  publicEvents: PublicWorldEvent[] | undefined,
  world: WorldState,
  reactions: Array<{ npcId: string; reaction: import("../../types").NPCReactionResult }> = []
): void {
  if (publicEvents === undefined) return;
  if (!Array.isArray(publicEvents)) throw new PipelineStageError("world_resolver", "publicEvents must be an array");

  const validSystemActors = new Set(["player", "world", "environment", "scene"]);
  const usedSpeechSources = new Set<string>();
  const canonicalJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };

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
      if ((!ev.speechPlan || typeof ev.speechPlan.summary !== "string") &&
          (typeof ev.content !== "string" || ev.content.trim() === "")) {
        throw new PipelineStageError(
          "world_resolver",
          `Public speech event by actor '${ev.actor}' must have non-empty content`
        );
      }
    }

    if (ev.type === "speech") {
      const sources = reactions.flatMap(r => r.reaction.intents.map(intent => ({ npcId: r.npcId, intent })));
      const matches = sources.filter(s => s.intent.id === ev.sourceIntentId);
      const source = matches[0];
      if (!ev.sourceIntentId || matches.length !== 1 || source.npcId !== ev.actor ||
          usedSpeechSources.has(ev.sourceIntentId) ||
          source.intent.type !== "speech" ||
          (source.intent.speechPlan && ev.speechPlan
            ? canonicalJson(source.intent.speechPlan) !== canonicalJson(ev.speechPlan)
            : source.intent.content?.trim() !== ev.content?.trim()) ||
          (source.intent.target || "") !== (ev.target || "")) {
        throw new PipelineStageError("world_resolver", `Public speech '${ev.actor}' has invalid sourceIntentId, actor, target or changed content`);
      }
      usedSpeechSources.add(ev.sourceIntentId);
    }

    if (ev.type === "action" && ev.sourceIntentId) {
      const sources = reactions.flatMap(r => r.reaction.intents.map(intent => ({ npcId: r.npcId, intent })));
      const matches = sources.filter(s => s.intent.id === ev.sourceIntentId);
      const source = matches[0];
      if (matches.length !== 1 || !source || source.npcId !== ev.actor || source.intent.type !== "action" ||
          source.intent.op !== ev.op || (source.intent.target || "") !== (ev.target || "")) {
        throw new PipelineStageError("world_resolver", `Public action '${ev.actor}' has invalid sourceIntentId, actor, target or op`);
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

/**
 * Every normalized NPC intent must have an explicit resolver disposition.
 * This prevents a resolver from silently dropping an action or speech intent.
 */
export function validateResolverCoverage(
  publicEvents: PublicWorldEvent[] | undefined,
  rejectedIntents: Array<{ intent: NPCIntent; reason: string }> | undefined,
  reactions: Array<{ npcId: string; reaction: import("../../types").NPCReactionResult }>
): void {
  const all = reactions.flatMap((reaction) => reaction.reaction.intents || []);
  const sources = new Map(all.map((intent) => [intent.id, intent]));
  const acceptedIds = (publicEvents || []).map((event) => event.sourceIntentId).filter((id): id is string => Boolean(id));
  const rejectedIds = (rejectedIntents || []).map((item) => item.intent?.id).filter((id): id is string => Boolean(id));
  const dispositions = [...acceptedIds, ...rejectedIds];
  const duplicate = new Set<string>();
  for (const id of dispositions) {
    if (duplicate.has(id)) throw new PipelineStageError("world_resolver", `Intent '${id}' has multiple resolver dispositions`);
    duplicate.add(id);
    if (!sources.has(id)) throw new PipelineStageError("world_resolver", `Resolver disposition references unknown intent '${id}'`);
  }
  const accepted = new Set(acceptedIds);
  const rejected = new Set(rejectedIds);
  for (const intent of all) {
    if (!intent.id) throw new PipelineStageError("world_resolver", "NPC intent is missing an id");
    if (!accepted.has(intent.id) && !rejected.has(intent.id)) {
      throw new PipelineStageError("world_resolver", `Resolver did not accept or reject intent '${intent.id}'`);
    }
  }
  for (const item of rejectedIntents || []) {
    if (!item.intent?.id || typeof item.reason !== "string" || !item.reason.trim()) {
      throw new PipelineStageError("world_resolver", "Every rejected intent must include an id and reason");
    }
  }
}
