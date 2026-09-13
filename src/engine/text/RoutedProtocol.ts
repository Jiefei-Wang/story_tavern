import type { CharacterDesign, CharacterRoute } from './types';
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
export const requiredText = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} 必须是非空文本`);
    return value;
};
const ids = (value: unknown, allowed: string[], field: string): string[] => {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !allowed.includes(id)) || new Set(value).size !== value.length)
        throw new Error(`${field} 含未授权或重复人物 ID`);
    return value;
};
export function validateRoute(value: any, allowed: string[], regeneratable = allowed): CharacterRoute {
    if (!object(value)) throw new Error('命令路由须返回 JSON 对象');
    const characters = ids(value.characters, allowed, 'characters');
    if (!Array.isArray(value.new_characters) || value.new_characters.length > 4)
        throw new Error('new_characters 必须是至多四位新人物的需求列表');
    const requests = value.new_characters.map((item: any) => {
        if (!object(item) || typeof item.request_id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.request_id))
            throw new Error('新人物 request_id 无效');
        return { request_id: item.request_id, description: requiredText(item.description, '新人物 description') };
    });
    if (new Set(requests.map((r: any) => r.request_id)).size !== requests.length) throw new Error('新人物 request_id 重复');
    const regenerate = value.regenerate_characters ?? [];
    if (!Array.isArray(regenerate)) throw new Error('regenerate_characters 必须为列表');
    ids(regenerate.map((r: any) => r?.character_id), regeneratable, 'regenerate_characters');
    const regenerate_characters = regenerate.map((r: any) => ({ character_id: r.character_id, description: requiredText(r.description, '重新生成人物 description') }));
    return { characters, new_characters: requests, regenerate_characters, instructions: requiredText(value.instructions, '路由 instructions') };
}
export function validateState(value: unknown): Record<string, unknown> {
    if (!object(value) || JSON.stringify(value).length > 32000) throw new Error('end_state / initial_state 必须为至多 32000 字符的 JSON 对象');
    return value;
}
export function validateDesigns(value: any, allowed: string[]): CharacterDesign[] {
    if (!object(value) || !Array.isArray(value.characters)) throw new Error('Designer 缺少 characters 列表');
    const selected = ids(value.characters.map((item: any) => item?.character_id), allowed, 'Designer.characters');
    if (selected.length !== allowed.length) throw new Error('Designer 必须为每位选中人物返回结果，沉默也不能遗漏');
    return value.characters.map((item: any) => {
        for (const key of ['expression', 'action'])
            if (item[key] !== null && typeof item[key] !== 'string') throw new Error(`${item.character_id}.${key} 必须是文本或 null`);
        return { character_id: item.character_id, expression: item.expression?.trim() || null, action: item.action?.trim() || null, end_state: validateState(item.end_state) };
    });
}
export function validateOutlines(value: any, allowed: string[]): CharacterDesign[] {
    if (!object(value) || !Array.isArray(value.characters)) throw new Error('Outline Designer 缺少 characters 列表');
    const selected = ids(value.characters.map((item: any) => item?.character_id), allowed, 'Outline.characters');
    if (selected.length !== allowed.length) throw new Error('Outline Designer 不能遗漏选中人物');
    return value.characters.map((item: any) => {
        for (const key of ['thought', 'expression_outline', 'action'])
            if (item[key] !== null && typeof item[key] !== 'string') throw new Error(`${item.character_id}.${key} 必须是文本或 null`);
        return { character_id: item.character_id, thought: item.thought?.trim() || null, expression_outline: item.expression_outline?.trim() || null,
            action: item.action?.trim() || null, end_state: validateState(item.end_state) };
    });
}
export function validateCards(value: any, requested: string[]) {
    if (!object(value) || !Array.isArray(value.cards)) throw new Error('Designer 创建结果缺少 cards');
    const received = ids(value.cards.map((card: any) => card?.request_id), requested, 'cards.request_id');
    if (received.length !== requested.length) throw new Error('新人物卡片数量与路由需求不一致');
    return value.cards.map((card: any) => ({ request_id: card.request_id,
        name: requiredText(card.name, 'name'), public: requiredText(card.public, 'public'), profile: requiredText(card.profile, 'profile'), initial_state: validateState(card.initial_state),
    })) as { request_id: string; name: string; public: string; profile: string; initial_state: Record<string, unknown> }[];
}
