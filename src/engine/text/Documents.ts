import type { TextWorld } from './types';
export function assertPath(path: string): void {
    if (!/^(world\/(common|private|description)|scenes\/[a-zA-Z0-9_-]+|characters\/[a-zA-Z0-9_-]+\/(profile|public|memory)|turns\/[a-zA-Z0-9_-]+)\.md$/.test(path))
        throw new Error('文档路径不在当前存档授权目录内');
}
export function validateTextWorld(world: TextWorld): void {
    if (world.version !== 1 || !Number.isInteger(world.revision) || world.revision < 0)
        throw new Error('文本存档版本无效');
    if (!['three', 'combined'].includes(world.characterMode))
        throw new Error('人物生成模式无效');
    if (!Array.isArray(world.characters) || !world.characters.includes(world.playerId) || new Set(world.characters).size !== world.characters.length)
        throw new Error('玩家必须存在，人物 ID 不可重复');
    for (const [path, doc] of Object.entries(world.documents)) {
        assertPath(path);
        if (!doc || typeof doc.text !== 'string' || !Number.isInteger(doc.revision) || doc.revision < 0)
            throw new Error('文档正文或版本无效');
    }
    const worldPaths = world.setupVersion === 2 ? ['world/description.md'] : ['world/common.md', 'world/private.md', world.scene];
    if (world.setupVersion === 2 && (!world.documents['world/description.md']?.text.trim() || world.scene !== 'world/description.md')) throw new Error('完整世界描述不能为空且必须作为世界引用');
    for (const path of [...worldPaths, ...world.characters.flatMap(id => ['profile', 'public', 'memory'].map(kind => `characters/${id}/${kind}.md`))]) {
        assertPath(path);
        if (!world.documents[path])
            throw new Error(`必要文档不存在：${path}`);
    }
    if (world.setupVersion === 2 && world.characters.some(id => !world.documents[`characters/${id}/public.md`].text.trim() || !world.documents[`characters/${id}/profile.md`].text.trim())) throw new Error('人物名字和设定不能为空');
    if (world.setupVersion !== 2 && !world.scene.startsWith('scenes/'))
        throw new Error('当前场景引用无效');
}
/** Capabilities are allocated by the Processor. Model text cannot change them. */
export class DocumentWorkspace {
    readonly world: TextWorld;
    constructor(source: TextWorld, readonly readable: Set<string>, readonly writable: Set<string>, readonly creatable = false) { this.world = structuredClone(source); }
    read(path: string) {
        assertPath(path);
        if (!this.readable.has(path))
            throw new Error('没有读取此文档的权限');
        const doc = this.world.documents[path];
        if (!doc)
            throw new Error('文档不存在');
        return { path, text: doc.text, revision: doc.revision };
    }
    create(path: string, text: string) {
        assertPath(path);
        if (!this.creatable || !this.writable.has(path))
            throw new Error('没有创建此文档的权限');
        if (this.world.documents[path])
            throw new Error('文档已存在');
        if (typeof text !== 'string' || !text.trim())
            throw new Error('正文不能为空');
        this.world.documents[path] = { text, revision: 0 };
        this.readable.add(path);
    }
    replace(path: string, expected_revision: number, old_text: string, new_text: string) {
        const doc = this.read(path);
        if (!this.writable.has(path))
            throw new Error('没有修改此文档的权限');
        if (doc.revision !== expected_revision)
            throw new Error('文档版本冲突，请重新读取');
        if (typeof old_text !== 'string' || (!old_text && doc.text !== '') || typeof new_text !== 'string')
            throw new Error('替换文本无效');
        const at = doc.text.indexOf(old_text);
        if (at < 0 || doc.text.indexOf(old_text, at + 1) >= 0)
            throw new Error('旧文本必须唯一匹配');
        this.world.documents[path] = { ...this.world.documents[path], text: doc.text.slice(0, at) + new_text + doc.text.slice(at + old_text.length), revision: doc.revision + 1 };
    }
}
