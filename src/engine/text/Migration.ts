import type { GameSave } from '../../types';
import type { TextWorld } from './types';
import { validateTextWorld } from './Documents';
import { migrateGameSave } from '../character-schema/Migration';
/** Human-readable archive conversion, never interpreted as a runtime numeric schema. */
function prose(value: unknown, label = ''): string {
    if (value === null || value === undefined)
        return '';
    if (Array.isArray(value))
        return value.map(v => prose(v, label)).filter(Boolean).join('\n');
    if (typeof value === 'object')
        return Object.entries(value).map(([k, v]) => prose(v, label ? `${label} / ${k}` : k)).filter(Boolean).join('\n');
    return `${label ? `${label}：` : ''}${String(value)}`;
}
export function migrateToText(raw: GameSave): GameSave {
    if (raw.textWorld) {
        validateTextWorld(raw.textWorld);
        return structuredClone(raw);
    }
    const save = structuredClone(raw), world = raw.worldState;
    if (!world.entities.player)
        throw new Error('旧存档缺少玩家；迁移未执行');
    const text: TextWorld = { version: 1, revision: 0, documents: {}, characters: [], playerId: 'player', scene: 'scenes/current.md', characterMode: 'three' };
    const put = (path: string, content: string) => { text.documents[path] = { text: content, revision: 0 }; };
    put('world/common.md', '# 世界常识\n迁移未把后台规则自动公开。常识需根据此世界和人物已有经历补充。');
    put('world/private.md', `# 后台设定（不可直接投递给人物或旁白）\n${prose(world.rules)}`);
    put(text.scene, `# 当前场景\n${prose(world.scene)}\n时间：${world.clock}\n\n${Object.entries(world.entities).map(([id, e]) => `${id}（${e.name || id}）位置：${e.location || '未说明'}${e.type === 'character' ? '' : '\n' + prose(e)}`).join('\n')}`);
    for (const [id, entity] of Object.entries(world.entities)) {
        if (entity.type !== 'character')
            continue;
        text.characters.push(id);
        put(`characters/${id}/public.md`, `# ${entity.name || id}\n公开身份：${entity.name || id}`);
        put(`characters/${id}/profile.md`, `# ${entity.name || id}\n${prose(entity.attributes)}\n${prose(entity.relationships, '已有关系描述')}\n${prose(Object.fromEntries(Object.entries(entity).filter(([k]) => !['type', 'name', 'location', 'attributes', 'relationships'].includes(k))))}`);
        put(`characters/${id}/memory.md`, `# 个人经历\n${prose(entity.attributes?.memory || (entity.mentalState as any)?.memory || '尚无已记录经历。')}`);
    }
    for (const [index, turn] of save.turns.entries())
        put(`turns/legacy_${index}.md`, `# 历史正文（仅用于连续性）\n${turn.playerInput}\n\n${turn.narratorOutput}`);
    validateTextWorld(text);
    return { ...save, legacyBackup: structuredClone(raw), textWorld: text };
}
export function createTextWorld(): TextWorld {
    const documents: TextWorld['documents'] = {};
    const put = (path: string, text: string) => { documents[path] = { text, revision: 0 }; };
    put('world/common.md', '# 世界常识\n古代港口以帆船和马车往来，人们没有现代电子设备的日常知识。');
    put('world/private.md', '# 后台设定\n远处的商船暗中运送违禁香料，此事并非人人知晓。');
    put('scenes/current.md', '# 港口酒馆\n清晨，海风微凉，天光明亮。玩家、艾琳和卫兵在酒馆门外；老板在柜台后。敞开的木门连接门外和柜台，室内有一张空木桌。');
    const people = [
        ['player', '玩家', '旅行者，自己的言行由玩家决定。', '刚抵达港口。'],
        ['erin', '艾琳', '想寻找离港机会。说话谨慎、简短，熟悉码头生活，对陌生事物会询问而不轻信。', '昨晚听见码头加强戒备，尚未向别人提起。'],
        ['guard', '卫兵', '负责盘查，措辞直接、礼貌而严肃。只认识古代日常器物。', '上级要求今天认真盘查，但未告知原因。'],
        ['tavern_owner', '酒馆老板', '招揽客人，语气随和，善于解释酒馆规矩，不喜欢卷入争端。', '清晨刚开店，尚不知门外人的来意。'],
    ];
    for (const [id, name, profile, memory] of people) {
        put(`characters/${id}/public.md`, `# ${name}\n公开称呼：${name}`);
        put(`characters/${id}/profile.md`, `# ${name}\n${profile}`);
        put(`characters/${id}/memory.md`, `# 个人经历\n${memory}`);
    }
    return { version: 1, revision: 0, documents, characters: people.map(p => p[0]), playerId: 'player', scene: 'scenes/current.md', characterMode: 'three' };
}
export function restoreLegacyCopy(save: GameSave): GameSave {
    if (!save.legacyBackup)
        throw new Error('此存档没有迁移备份');
    const legacy = migrateGameSave(structuredClone(save.legacyBackup));
    legacy.id = `restored_${crypto.randomUUID()}`;
    legacy.name = `${legacy.name} · 迁移前副本`;
    legacy.updatedAt = new Date().toISOString();
    return legacy;
}
