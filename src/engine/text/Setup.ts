import type { TextWorld } from "./types";

/** Only authorized game definitions become Prompt variables; display metadata stays out. */
export function setupPromptData(world: TextWorld) {
  const character = (id: string) => ({ id, ...(world.setupVersion === 2 ? { definition: world.documents[`characters/${id}/profile.md`].text, initialMemory: world.documents[`characters/${id}/memory.md`].text } : {}), name: world.documents[`characters/${id}/public.md`].text });
  return {
    world: world.documents[world.setupVersion === 2 ? 'world/description.md' : 'world/common.md'].text,
    characters: world.characters.filter(id => id !== world.playerId).map(character), player: character(world.playerId),
  };
}
