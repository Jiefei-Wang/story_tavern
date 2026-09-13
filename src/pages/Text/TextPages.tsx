import { stateDescription } from './stateDescription';
import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGameStore } from '../../stores/useGameStore';
import { storageService } from '../../db/storage';
import { DocumentWorkspace, validateTextWorld } from '../../engine/text/Documents';
import { characterHistory, visibleNarration } from '../../engine/text/History';
import { restoreLegacyCopy } from '../../engine/text/Migration';
export function TextDocumentsPage({ section = 'world' }: {
    section?: 'world' | 'characters' | 'inspector';
}) {
    const { activeSave, isExecuting } = useGameStore();
    const [searchParams] = useSearchParams();
    const [path, setPath] = useState(''), [text, setText] = useState(''), [revision, setRevision] = useState(0), [message, setMessage] = useState('');
    const editorRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (path) { editorRef.current?.focus(); editorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, [path]);
    if (!activeSave?.textWorld)
        return null;
    const world = activeSave.textWorld;
    const character = searchParams.get('character');
    const selectDocument = (p: string) => { setPath(p); setText(p.startsWith('turns/') ? visibleNarration(world.documents[p].text) : world.documents[p].text); setRevision(world.documents[p].revision); setMessage(''); };
    const paths = Object.keys(world.documents).filter(p => section === 'characters' ? p.startsWith('characters/') : section === 'world' ? !p.startsWith('characters/') && !p.startsWith('turns/') : true);
    const save = async () => {
        useGameStore.setState({ isExecuting: true });
        try {
            const workspace = new DocumentWorkspace(world, new Set([path]), new Set([path]));
            workspace.replace(path, revision, world.documents[path].text, text);
            workspace.world.revision++;
            const candidate = { ...activeSave, textWorld: workspace.world, updatedAt: new Date().toISOString() };
            await storageService.commitTextGame(candidate, world.revision);
            useGameStore.setState(s => ({ saves: s.saves.map(old => old.id === candidate.id ? candidate : old), activeSave: s.activeSave?.id === candidate.id ? candidate : s.activeSave }));
            setRevision(workspace.world.documents[path].revision);
            setMessage('文档已保存');
        }
        catch (e) {
            setMessage(String(e));
        }
        finally {
            useGameStore.setState({ isExecuting: false });
        }
    };
    const last = activeSave.turns.at(-1)?.textTurn;
    const restore = async () => {
        useGameStore.setState({ isExecuting: true });
        try {
            const copy = restoreLegacyCopy(activeSave);
            await storageService.saveGame(copy);
            useGameStore.setState(s => ({ saves: [...s.saves, copy] }));
            setMessage(`已创建恢复副本：${copy.name}，可在首页载入。`);
        }
        catch (e) {
            setMessage(String(e));
        }
        finally {
            useGameStore.setState({ isExecuting: false });
        }
    };
    return <main className="max-w-5xl mx-auto p-6 space-y-4"><h1 className="text-2xl">{section === 'characters' ? '人物文本' : section === 'inspector' ? '文档差异与提交' : '世界文本'}</h1><p>作者视图包含私人设定。Designer 根据人物卡片、历史状态和故事记录设计回应。</p><p className="text-sm text-slate-500">{storageService.usesLocalService() ? '本地共享存储：Markdown 按版本落盘，SQLite 指向完整版本。' : '浏览器预览：文档存于浏览器存储，不代表桌面文件落盘。'}</p>
    <p className="text-sm text-slate-500">运行流程：命令路由 → Designer → Narrator</p>
    {!!activeSave.legacyBackup && <button disabled={isExecuting} onClick={restore} className="block border px-3 py-2 rounded">从迁移备份创建旧版副本</button>}
    {section === 'characters' && <>
      <nav className="flex flex-wrap gap-2"><Link className="text-sm text-blue-600 hover:underline" to="/save-characters">全部人物</Link>{world.characters.map(id => <Link key={id} className="text-sm px-3 py-1 rounded-lg border bg-white hover:border-blue-300" to={`/save-characters?character=${encodeURIComponent(id)}`}>{world.documents[`characters/${id}/public.md`].text.split('\n')[0].replace(/^#+\s*/, '')}</Link>)}</nav>
      {character && !world.characters.includes(character) && <p role="alert">未找到此人物，请从人物列表选择。</p>}
      <div className={character ? "space-y-4" : "grid md:grid-cols-2 xl:grid-cols-3 gap-4"}>{world.characters.filter(id => !character || id === character).map(id => <article key={id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <header><h2 className="font-bold text-slate-800">{world.documents[`characters/${id}/public.md`].text.split('\n')[0].replace(/^#+\s*/, '')}{id === world.playerId ? ' · 玩家' : ''}</h2><p className="text-xs text-slate-400">{id}</p></header>
        {(['public', 'profile', 'memory'] as const).map(kind => { const p = `characters/${id}/${kind}.md`; return <section key={kind} className="border-t border-slate-100 pt-3 space-y-2"><div className="flex justify-between items-center"><h3 className="text-sm font-semibold">{{public:'公开资料',profile:'人物设定',memory:'初始记忆与背景'}[kind]}</h3><button disabled={isExecuting} onClick={() => selectDocument(p)} className="text-xs text-blue-600 hover:underline">编辑</button></div><p className="text-sm text-slate-600 whitespace-pre-wrap leading-6">{world.documents[p].text}</p></section>; })}
        {characterHistory(activeSave.turns, id).slice(-1).map((state, index) => <section key={index} className="border-t border-slate-100 pt-3 space-y-2"><h3 className="text-sm font-semibold">当前人物状态</h3><p className="text-xs text-slate-400">由 Designer 生成并随正文保存，可通过游戏输入提出调整。</p><p className="text-sm text-slate-600 whitespace-pre-wrap leading-6">{stateDescription(state.end_state)}</p></section>)}
      </article>)}</div>
    </>}
    <div className="flex flex-col xl:flex-row gap-4"><nav className={section === 'characters' ? 'hidden' : "w-full xl:w-64 shrink-0 space-y-1"}>{(section === 'characters' ? [] : paths).map(p => <button key={p} className="block text-left text-sm break-all p-2 border rounded w-full" onClick={() => selectDocument(p)}>{p}</button>)}</nav><section className="grow">{path && <><h2>{path}</h2><textarea ref={editorRef} aria-label="文档正文" className="w-full min-h-96 border p-3 mt-3 font-mono text-sm" value={text} onChange={e => setText(e.target.value)} disabled={isExecuting || path.startsWith('turns/')}/><button disabled={isExecuting || path.startsWith('turns/')} className="bg-blue-600 text-white px-4 py-2 rounded" onClick={save}>保存文档</button></>}<p role="status">{message}</p></section></div>
    {section === 'inspector' && last && <section><h2>最近回合：{last.commit === 'saved' ? '已保存' : '草稿'}</h2>{Object.keys(last.after.documents).filter(p => last.before.documents[p]?.text !== last.after.documents[p].text).map(p => <details key={p}><summary>{p}</summary><pre className="whitespace-pre-wrap bg-red-50 p-3">− {visibleNarration(last.before.documents[p]?.text || '（新建）')}</pre><pre className="whitespace-pre-wrap bg-green-50 p-3">+ {visibleNarration(last.after.documents[p].text)}</pre></details>)}</section>}
  </main>;
}
export function LegacyMigration({ children }: {
    children: React.ReactNode;
}) {
    const { migrateActiveToText, isExecuting } = useGameStore();
    const [error, setError] = useState('');
    return <><aside className="p-3 bg-amber-50">此存档仍使用旧流程。迁移会保留完整原始备份和历史。<button disabled={isExecuting} className="underline ml-3" onClick={() => migrateActiveToText().catch(e => setError(String(e)))}>迁移为文本故事</button>{error}</aside>{children}</>;
}
