import { z } from 'zod';
import type { GameSave, WorldState } from '../../types';
import type { TextWorld } from '../text/types';
import { validateTextWorld } from '../text/Documents';

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/).refine(s => !['__proto__', 'prototype', 'constructor'].includes(s), 'ID 不可使用保留名称');
const required = z.string().refine(s => !!s.trim(), '内容不能为空');
export const imageSchema = z.string().max(1_500_000).refine(s => !s || /^https?:\/\/[^\s]+$/.test(s) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s), '图片需为 HTTP(S) 地址或 PNG/JPEG/WebP 图片');
export const characterSchema = z.object({ id, name: required, setting: required, details: z.string(), initialMemory: z.string(), image: imageSchema.optional() }).passthrough();
export const worldSchema = z.object({ id, name: required, summary: z.string(), description: required, image: imageSchema.optional() }).passthrough();
export const storySchema = z.object({ id, name: required, summary: z.string(), worldId: id, playerId: id, supportingIds: z.array(id), opening: required }).passthrough();
export const librarySchema = z.object({ characters: z.record(id, characterSchema), worlds: z.record(id, worldSchema), stories: z.record(id, storySchema), selectedStoryId: id.nullable() }).passthrough();
export type Character = z.infer<typeof characterSchema>;
export type World = z.infer<typeof worldSchema>;
export type Story = z.infer<typeof storySchema>;
export type Library = z.infer<typeof librarySchema>;
export type LibraryKind = 'characters' | 'worlds' | 'stories';
export interface LibraryRecord { revision: number; data: Library }
export const emptyLibrary = (): Library => ({ characters: {}, worlds: {}, stories: {}, selectedStoryId: null });
export function validateLibrary(value: unknown): asserts value is Library {
  librarySchema.parse(value); // Use the original object: retain unknown fields.
  const library = value as Library;
  for (const kind of ['characters', 'worlds', 'stories'] as const) for (const [key, item] of Object.entries(library[kind])) {
    if (key !== item.id) throw new Error('配置 ID 与集合键必须一致');
  }
  for (const story of Object.values(library.stories)) {
    if (!library.worlds[story.worldId]) throw new Error(`故事「${story.name}」引用的世界不存在，请先更换世界`);
    if (!library.characters[story.playerId]) throw new Error(`故事「${story.name}」必须选择有效主角`);
    if (new Set(story.supportingIds).size !== story.supportingIds.length || story.supportingIds.includes(story.playerId)) throw new Error('配角不能重复，也不能包含主角');
    if (story.supportingIds.some(key => !library.characters[key])) throw new Error(`故事「${story.name}」引用的配角不存在，请先解除引用`);
  }
  if (library.selectedStoryId && !library.stories[library.selectedStoryId]) throw new Error('首页选中的故事不存在');
}
export function defaultLibrary(): Library {
  const characters: Record<string, Character> = {
    player: { id: 'player', name: '旅行者', setting: '刚抵达港口的旅行者，自己的言行由玩家决定。', details: '', initialMemory: '刚抵达港口。' },
    erin: { id: 'erin', name: '艾琳', setting: '想寻找离港机会，熟悉码头生活。', details: '说话谨慎、简短，对陌生事物会询问而不轻信。', initialMemory: '昨晚听见码头加强戒备，尚未向别人提起。' },
    guard: { id: 'guard', name: '卫兵', setting: '负责盘查，措辞直接、礼貌而严肃。', details: '只认识古代日常器物。', initialMemory: '上级要求今天认真盘查，但未告知原因。' },
    tavern_owner: { id: 'tavern_owner', name: '酒馆老板', setting: '招揽客人，语气随和，善于解释酒馆规矩。', details: '不喜欢卷入争端。', initialMemory: '清晨刚开店，尚不知门外人的来意。' },
  };
  return { characters, worlds: { harbor: { id: 'harbor', name: '潮汐港', summary: '帆船与马车往来的古代港口，一间酒馆连接远方与秘密。', description: '古代港口以帆船和马车往来，人们没有现代电子设备的日常知识。码头边有一间海港酒馆，敞开的木门连接门外与柜台，室内有一张空木桌。远处的商船暗中运送违禁香料，此事并非人人知晓。' } }, stories: { harbor_story: { id: 'harbor_story', name: '港口的清晨', summary: '你抵达潮汐港，在海风与晨光中遇见几位陌生人。接下来的旅程，由你决定。', worldId: 'harbor', playerId: 'player', supportingIds: ['erin', 'guard', 'tavern_owner'], opening: '晨光划破港口上空的薄雾，微凉的海风带来咸涩的潮气。你站在海港酒馆门外，艾琳和一名卫兵就在不远处。门内，酒馆老板正收拾柜台。一段新的旅程即将在这里展开。' } }, selectedStoryId: 'harbor_story' };
}

export function createStorySave(library: Library, storyId: string, groupId: string): GameSave {
  validateLibrary(library);
  const story = library.stories[storyId];
  if (!story) throw new Error('请先选择故事');
  const definition = library.worlds[story.worldId];
  const people = [story.playerId, ...story.supportingIds].map(id => library.characters[id]);
  const documents: TextWorld['documents'] = {};
  const put = (path: string, text: string) => { documents[path] = { text, revision: 0 }; };
  put('world/description.md', definition.description);
  for (const person of people) {
    put(`characters/${person.id}/public.md`, person.name);
    put(`characters/${person.id}/profile.md`, [person.setting, person.details].filter(Boolean).join('\n\n'));
    put(`characters/${person.id}/memory.md`, person.initialMemory);
  }
  const textWorld: TextWorld = { version: 1, setupVersion: 2, revision: 0, documents, characters: people.map(p => p.id), playerId: story.playerId, scene: 'world/description.md', characterMode: 'combined' };
  validateTextWorld(textWorld);
  const now = new Date().toISOString();
  const worldState: WorldState = { clock: now, scene: { location: '', weather: '', lighting: '' }, entities: Object.fromEntries(people.map(p => [p.id, { type: 'character' as const, name: p.name }])), rules: {} };
  return { id: `save_${crypto.randomUUID()}`, name: story.name, storyInfo: { storyId, title: story.name, summary: story.summary }, worldDefinition: { version: 1, characterSchema: { version: 1, sections: [] } }, createdAt: now, updatedAt: now, textWorld, worldState, activeAgentGroupId: groupId,
    turns: [{ id: `opening_${crypto.randomUUID()}`, turnIndex: 0, timestamp: now, playerInput: '', narratorOutput: story.opening, traceId: '', worldStateBefore: structuredClone(worldState), worldStateAfter: structuredClone(worldState), patches: [], activeAgentGroupId: groupId, status: 'success' }] };
}
