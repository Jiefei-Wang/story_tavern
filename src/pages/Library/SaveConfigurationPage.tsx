import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CollectionCard, DetailShell, DetailText } from '../../components/Common/Collection';
import { useGameStore } from '../../stores/useGameStore';
import { storageService } from '../../db/storage';
import { validateTextWorld } from '../../engine/text/Documents';
import { characterHistory } from '../../engine/text/History';
import { stateDescription } from '../Text/stateDescription';

export function SaveConfigurationPage({ kind }: { kind: 'characters' | 'world' }) {
  const [params] = useSearchParams();
  const { activeSave: save, isExecuting } = useGameStore();
  const world = save?.textWorld;
  const id = params.get('character');
  const [editing, setEditing] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({}), [revision, setRevision] = useState(0);
  if (!world || !save) return <DetailShell title="还没有开始故事" backHref="/" backLabel="返回首页"><p>请先开始故事或进入存档。</p></DetailShell>;
  const name = (key: string) => world.documents[`characters/${key}/public.md`].text.replace(/^#+\s*/, '').split('\n')[0];
  if (kind === 'characters' && !id) return <DetailShell title="本局角色" backHref="/play" backLabel="返回游戏"><p className="text-sm text-slate-500">这里的资料属于当前存档。编辑不会影响角色库或其他故事。</p><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{world.characters.map(key => <CollectionCard key={key} href={`/save-characters?character=${encodeURIComponent(key)}`} title={name(key)} description={world.documents[`characters/${key}/profile.md`].text} label={key === world.playerId ? '玩家' : '配角'}/>)}</div></DetailShell>;
  if (kind === 'characters' && !world.characters.includes(id!)) return <DetailShell title="未找到本局人物" backHref="/save-characters" backLabel="本局角色"><p>请选择本局已有的人物。</p></DetailShell>;
  const fields = kind === 'world' ? [{ path: 'world/description.md', label: '完整世界描述' }] : [
    { path: `characters/${id}/public.md`, label: '名字与公开资料' },
    { path: `characters/${id}/profile.md`, label: '完整人物设定' },
    { path: `characters/${id}/memory.md`, label: '初始记忆与背景' },
  ];
  const begin = () => { setDraft(Object.fromEntries(fields.map(f => [f.path, world.documents[f.path]?.text || '']))); setRevision(world.revision); setError(''); setEditing(true); };
  const commit = async () => {
    const state = useGameStore.getState();
    if (state.isExecuting) return;
    if (state.activeSave?.id !== save.id || state.activeSave.textWorld?.revision !== revision) { setError('存档已变化，请取消编辑后重新打开。'); return; }
    useGameStore.setState({ isExecuting: true }); setError('');
    try {
      const candidate = structuredClone(state.activeSave);
      for (const field of fields) { const doc = candidate.textWorld!.documents[field.path]; if (doc.text !== draft[field.path]) candidate.textWorld!.documents[field.path] = { ...doc, text: draft[field.path], revision: doc.revision + 1 }; }
      candidate.textWorld!.revision++; candidate.updatedAt = new Date().toISOString(); validateTextWorld(candidate.textWorld!);
      await storageService.commitTextGame(candidate, revision);
      useGameStore.setState(s => ({ saves: s.saves.map(old => old.id === candidate.id ? candidate : old), activeSave: s.activeSave?.id === candidate.id ? candidate : s.activeSave })); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { useGameStore.setState({ isExecuting: false }); }
  };
  return <DetailShell title={kind === 'world' ? '本局世界设定' : name(id!)} backHref={kind === 'world' ? '/play' : '/save-characters'} backLabel={kind === 'world' ? '返回游戏' : '本局角色'} actions={!editing && <button disabled={isExecuting} className="library-secondary" onClick={begin}>修改本局资料</button>}>
    <p className="text-sm text-slate-500">修改仅影响当前存档后续的生成，保留已发生的故事与人物状态。</p>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {editing ? <form className="library-panel space-y-6" onSubmit={e => { e.preventDefault(); void commit(); }}><fieldset disabled={isExecuting} className="space-y-5">{fields.map(f => <label key={f.path} className="block space-y-2 text-sm">{f.label}<textarea className="library-input min-h-40" value={draft[f.path]} onChange={e => setDraft(d => ({ ...d, [f.path]: e.target.value }))}/></label>)}<div className="flex gap-3"><button className="library-primary">保存</button><button type="button" className="library-secondary" onClick={() => { setEditing(false); setError(''); }}>取消</button></div></fieldset></form> : <article className="library-panel space-y-8">{fields.map(f => <DetailText key={f.path} title={f.label}>{world.documents[f.path]?.text}</DetailText>)}</article>}
    {kind === 'characters' && characterHistory(save.turns, id!).slice(-1).map((state, index) => <section key={index} className="library-panel"><DetailText title="当前人物状态（随故事更新）">{stateDescription(state.end_state)}</DetailText></section>)}
  </DetailShell>;
}
