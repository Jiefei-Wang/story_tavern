import type { TextWorld } from './types';
import type { RuntimeMessage } from '../runtime/AgentRuntime';

/** Explicit allowlist: library display metadata and images never become prompt material. */
export function setupMessages(world: TextWorld): RuntimeMessage[] {
  const character = (id: string) => ({ id, name: world.documents[`characters/${id}/public.md`].text, definition: world.documents[`characters/${id}/profile.md`].text, initialMemory: world.documents[`characters/${id}/memory.md`].text });
  return [{ role: 'user', content: `以下是本局游戏的定义。请回复「收到」。\n\n世界定义：\n${world.documents['world/description.md'].text}\n\n角色定义（配角）：\n${JSON.stringify(world.characters.filter(id => id !== world.playerId).map(character), null, 2)}\n\n玩家定义（主角，其自主言行由玩家决定）：\n${JSON.stringify(character(world.playerId), null, 2)}` }, { role: 'assistant', content: '收到' }];
}
