import { CommittedTurnEvent, GameEvent, InteractionContext, WorldState } from "../../types";
import { SpatialEngine } from "./SpatialEngine";
import { PipelineStageError } from "../errors/PipelineStageError";

export function resolveSpeechTargets(events: GameEvent[], world: WorldState): GameEvent[] {
  const present = new Set(SpatialEngine.getSceneCharacters(world, false).map(c => c.id));
  let focus = world.conversation?.focusNpcId;
  return events.map(event => {
    if (event.type !== "speech") return event;
    if (event.actor && event.actor !== "player") throw new PipelineStageError("input_compiler", "Compiler cannot create NPC speech");
    const target = event.target?.trim() || (focus && present.has(focus) ? focus : "");
    if (target && target !== "all" && target !== "group" && !present.has(target)) {
      throw new PipelineStageError("input_compiler", `Unknown or absent speech target '${target}'`);
    }
    if (present.has(target)) focus = target;
    return { ...event, actor: "player", target };
  });
}

export function interactionFor(npcId: string, events: GameEvent[]): InteractionContext {
  const addressed = events.some(e => e.type === "speech" && (!e.actor || e.actor === "player") &&
    [npcId, "all", "group"].includes(e.target || ""));
  return { addressed, maySpeak: addressed, speechPermission: addressed ? "direct" : "none" };
}

export function updateConversation(world: WorldState, events: CommittedTurnEvent[]): void {
  const conversation = { ...world.conversation };
  for (const event of events) {
    if (event.type === "npc_speech" && event.actor) {
      conversation.lastSpeakerId = event.actor;
      if (event.target === "player") conversation.focusNpcId = event.actor;
    } else if (event.type === "player_speech" && event.target && world.entities[event.target]?.type === "character") {
      conversation.lastAddressedNpcId = event.target;
      conversation.focusNpcId = event.target;
    }
  }
  world.conversation = conversation;
}
