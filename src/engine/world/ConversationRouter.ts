import { CommittedTurnEvent, GameEvent, InteractionContext, WorldState } from "../../types";
import { SpatialEngine } from "./SpatialEngine";
import { PipelineStageError } from "../errors/PipelineStageError";

export function resolveSpeechTargets(events: GameEvent[], world: WorldState, playerInput?: string): GameEvent[] {
  const present = new Set(SpatialEngine.getSceneCharacters(world, false).map(c => c.id));
  let focus = world.conversation?.focusNpcId;
  return events.map(event => {
    if (event.actor && event.actor !== "player") throw new PipelineStageError("input_compiler", "Input Compiler cannot create NPC events");
    if (event.type !== "speech") {
      const details = { ...event.details };
      delete details.responseRequested;
      const request = event.responseRequest;
      if (request) {
        const prose = (playerInput || '').replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/g, match => ' '.repeat(match.length));
        const text = typeof request.sourceText === 'string' ? request.sourceText.trim() : '';
        const start = text ? prose.indexOf(text) : -1;
        const prefix = start >= 0 ? prose.slice(0, start).split(/[，,。.!！?？;；\n]/).at(-1) || '' : '';
        const currentRequest = /(?:听|聽|listen\s+to).*(?:讲|讲解|解释|回答|說|说|explain|answer|speak)/i.test(text) &&
          !/(?:如果|假如|假设|要是|倘若|\bif\b|不想|不再|不听|不要|别|勿|无需|不用|曾经|以前|打算以后|明天|之后再|旁听|偷听|窃听|overhear|eavesdrop)/i.test(prefix + text) &&
          !/(?:不|别|勿)\s*$/.test(prefix) && !/(?:对|给|向)(?!我|玩家).{1,24}(?:讲|说|回答)/.test(text);
        if (event.type !== 'action' || event.op !== 'listen_to' || event.target !== request.target || !present.has(request.target) || start < 0 || !currentRequest) {
          throw new PipelineStageError('input_compiler', 'Response request needs a current unquoted input source and one present matching NPC');
        }
        details.responseRequested = true;
      }
      return { ...event, actor: "player", details };
    }
    const target = event.target?.trim() || (focus && present.has(focus) ? focus : "");
    const targetUnavailable = !!target && target !== "all" && target !== "group" && !present.has(target);
    if (present.has(target)) focus = target;
    return { ...event, actor: "player", target,
      ...(targetUnavailable ? { details: { ...event.details, targetUnavailable: true } } : {}),
    };
  });
}

export function interactionFor(npcId: string, events: GameEvent[]): InteractionContext {
  const addressed = events.some(e => !e.details?.targetUnavailable && (!e.actor || e.actor === "player") && (
    (e.type === "speech" && [npcId, "all", "group"].includes(e.target || "")) ||
    (e.type === 'action' && e.op === 'listen_to' && e.target === npcId && e.details?.responseRequested === true && e.outcome?.status === 'success')
  ));
  return { addressed, maySpeak: addressed, speechPermission: addressed ? "direct" : "none" };
}

export function updateConversation(world: WorldState, events: CommittedTurnEvent[]): void {
  const conversation = { ...world.conversation };
  for (const event of events) {
    if (event.type === "npc_speech" && event.actor) {
      conversation.lastSpeakerId = event.actor;
      if (event.target === "player") conversation.focusNpcId = event.actor;
    } else if (event.type === "player_speech" && event.target && world.entities[event.target]?.type === "character" &&
      SpatialEngine.isEntityInScene(event.target, world.entities[event.target], world)) {
      conversation.lastAddressedNpcId = event.target;
      conversation.focusNpcId = event.target;
    }
  }
  world.conversation = conversation;
}
