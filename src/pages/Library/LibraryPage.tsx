import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { Collection, CollectionCard, DetailShell, DetailText } from '../../components/Common/Collection';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { type LibraryKind, type Character, type World, type Story, imageSchema } from '../../engine/library/Library';

const labels = { characters: '角色', worlds: '世界', stories: '故事' };
const bases = { characters: '/characters', worlds: '/world', stories: '/stories' };
const hints = { characters: '写下人物的名字与设定，让他们走进不同的故事。', worlds: '构建故事发生的地方，从一段完整的世界描述开始。', stories: '选择世界与演员，写下故事的第一幕。' };
type Item = Character | World | Story;
const blank = (kind: LibraryKind): Item => {
  const common = { id: `${kind}_${crypto.randomUUID()}`, name: '' };
  return kind === 'characters' ? { ...common, setting: '', details: '', initialMemory: '' } : kind === 'worlds' ? { ...common, summary: '', description: '' } : { ...common, summary: '', worldId: '', playerId: '', supportingIds: [], opening: '' };
};

export function LibraryPage({ kind }: { kind: LibraryKind }) {
  const { id } = useParams();
  return <LibraryView key={`${kind}:${id || 'list'}`} kind={kind} id={id}/>;
}
function LibraryView({ kind, id }: { kind: LibraryKind; id?: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { record, saving, save, selectStory } = useLibraryStore();
  const library = record.data;
  const existing = id ? library[kind][id] : undefined;
  const [editing, setEditing] = useState(id === 'new');
  const [draft, setDraft] = useState<Item>(() => structuredClone(existing || blank(kind)));
  const [revision, setRevision] = useState(record.revision);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const base = bases[kind], label = labels[kind];
  const change = (key: string, value: unknown) => setDraft(previous => ({ ...previous, [key]: value }));
  const run = async (action: () => Promise<void>) => { setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const startEdit = () => { setDraft(structuredClone(existing!)); setRevision(record.revision); setError(''); setEditing(true); };
  const commit = () => run(async () => {
    if (record.revision !== revision) throw new Error('配置已变化，请取消编辑后重新打开，避免覆盖他人的修改');
    await save({ ...library, [kind]: { ...library[kind], [draft.id]: draft } }, revision);
    setEditing(false); navigate(`${base}/${draft.id}`, { replace: true });
  });
  const remove = () => run(async () => {
    if (!window.confirm(`删除「${existing!.name}」？已有存档仍会保留。`)) return;
    const collection = { ...library[kind] }; delete collection[id!];
    await save({ ...library, [kind]: collection, selectedStoryId: kind === 'stories' && library.selectedStoryId === id ? null : library.selectedStoryId }, record.revision);
    navigate(base);
  });
  const choose = () => run(async () => { await selectStory(id!); navigate('/'); });
  const textField = (key: string, title: string, multiline = true, help = '', required = false) => <label className="block space-y-2" key={key}><span className="text-sm font-medium text-slate-700">{title}{required && <span className="text-blue-600 ml-1">*</span>}</span>{multiline ? <textarea required={required} className={`library-input ${key === 'description' || key === 'opening' ? 'min-h-64' : 'min-h-28'}`} value={String(draft[key] || '')} onChange={e => change(key, e.target.value)}/> : <input required={required} className="library-input" value={String(draft[key] || '')} onChange={e => change(key, e.target.value)}/>} {help && <p className="text-xs text-slate-400 leading-5">{help}</p>}</label>;
  const imageEditor = <section className="space-y-3">{textField('image', kind === 'characters' ? '头像地址（可选）' : '世界图片地址（可选）', false, '可以填写图片网址，或上传不超过 1 MB 的 PNG、JPEG、WebP 图片。')}<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 1_000_000) { setError('图片不能超过 1 MB'); return; }
    const reader = new FileReader(); reader.onerror = () => setError('图片读取失败'); reader.onload = () => { const parsed = imageSchema.safeParse(reader.result); if (!parsed.success) { setError('请使用 PNG、JPEG 或 WebP 图片'); return; } change('image', parsed.data); setError(''); }; reader.readAsDataURL(file); e.target.value = '';
  }}/><div className="flex gap-2"><button type="button" className="library-secondary" onClick={() => fileInput.current?.click()}>上传图片</button>{!!draft.image && <button type="button" className="library-secondary" onClick={() => change('image', '')}>移除图片</button>}</div>{typeof draft.image === 'string' && draft.image && imageSchema.safeParse(draft.image).success && <img src={draft.image} alt="图片预览" className="h-32 max-w-full object-cover rounded-xl"/>}</section>;

  if (!id) return <Collection title={label} description={params.get('select') ? '选择一个故事，查看详情后将它设为首页故事。' : hints[kind]} count={Object.keys(library[kind]).length} createHref={`${base}/new`}>
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">{Object.values(library[kind]).map(item => <CollectionCard key={item.id} href={`${base}/${item.id}`} title={item.name} description={String(kind === 'characters' ? item.setting : item.summary)} image={typeof item.image === 'string' ? item.image : undefined} label={kind === 'stories' ? library.selectedStoryId === item.id ? '当前故事' : library.worlds[String(item.worldId)]?.name : undefined}/>)}</div>
    {!Object.keys(library[kind]).length && <div className="library-panel text-center py-16 text-slate-400">还没有{label}，创建第一个{label}吧。</div>}
  </Collection>;
  if (id !== 'new' && !existing) return <DetailShell title={`${label}不存在`} backHref={base} backLabel={`返回${label}`}><p className="text-slate-500">它可能已被删除，请返回列表重新选择。</p></DetailShell>;
  const item = existing || draft;
  return <DetailShell title={editing ? `${id === 'new' ? '新建' : '编辑'}${label}` : item.name} backHref={base} backLabel={`全部${label}`} actions={!editing && <><button disabled={saving} className="library-secondary" onClick={startEdit}><Pencil size={15}/>修改</button><button disabled={saving} className="library-secondary text-red-600" onClick={remove}><Trash2 size={15}/>删除</button>{kind === 'stories' && <button disabled={saving} className="library-primary" onClick={choose}><Check size={16}/>选择此故事</button>}</>}>
    {error && <p role="alert" className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-4 text-sm">{error}</p>}
    {editing ? <form className="library-panel" onSubmit={e => { e.preventDefault(); void commit(); }}><fieldset disabled={saving} className="space-y-6">
      {textField('name', kind === 'stories' ? '故事标题' : `${label}名字`, false, '', true)}
      {kind === 'characters' && <>{textField('setting', '角色设定', true, '显示在角色卡片上，同时作为人物定义发送给模型。', true)}{textField('details', '详细资料')}{textField('initialMemory', '初始记忆与背景')}{imageEditor}</>}
      {kind === 'worlds' && <>{textField('summary', '概要', true, '仅用于展示。')}{textField('description', '完整世界描述', true, '自由文本。世界配置中只有这部分会发送给模型；人物不会自动知晓其中的秘密。', true)}{imageEditor}</>}
      {kind === 'stories' && <>{textField('summary', '故事简介', true, '用于首页与卡片展示。')}<div className="grid sm:grid-cols-2 gap-5"><label className="space-y-2 text-sm">世界<select required className="library-input mt-2" value={String(draft.worldId)} onChange={e => change('worldId', e.target.value)}><option value="">选择世界</option>{Object.values(library.worlds).map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></label><label className="space-y-2 text-sm">主角（玩家）<select required className="library-input mt-2" value={String(draft.playerId)} onChange={e => { const playerId = e.target.value; setDraft(d => ({ ...d, playerId, supportingIds: (d.supportingIds as string[]).filter(id => id !== playerId) })); }}><option value="">选择主角</option>{Object.values(library.characters).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div>
        {(!Object.keys(library.worlds).length || !Object.keys(library.characters).length) && <p className="text-sm text-amber-700">请先创建世界和角色，再配置故事。</p>}
        <section className="space-y-3"><h2 className="text-sm font-medium">配角 <span className="font-normal text-slate-400">可多选，也可以不选</span></h2><div className="grid sm:grid-cols-2 gap-2">{Object.values(library.characters).filter(c => c.id !== draft.playerId).map(c => <label key={c.id} className="border rounded-xl p-3 flex gap-3 items-center text-sm"><input type="checkbox" checked={(draft.supportingIds as string[]).includes(c.id)} onChange={e => change('supportingIds', e.target.checked ? [...draft.supportingIds as string[], c.id] : (draft.supportingIds as string[]).filter(id => id !== c.id))}/>{c.name}</label>)}</div></section>
        {textField('opening', '开头消息', true, '直接作为第一条故事正文，并加入后续消息历史。请在这里交代初始场景。', true)}</>}
      <div className="flex gap-3 border-t pt-6"><button className="library-primary" type="submit">{saving ? '正在保存…' : '保存'}</button><button className="library-secondary" type="button" onClick={() => { setError(''); if (id === 'new') navigate(base); else setEditing(false); }}>取消</button></div>
    </fieldset></form> : <article className="library-panel space-y-8">
      {typeof item.image === 'string' && item.image && <img src={item.image} alt={item.name} className="max-h-64 max-w-full rounded-xl object-cover"/>}
      {kind === 'characters' && <><DetailText title="角色设定">{String(item.setting)}</DetailText><DetailText title="详细资料">{String(item.details)}</DetailText><DetailText title="初始记忆与背景">{String(item.initialMemory)}</DetailText></>}
      {kind === 'worlds' && <><DetailText title="概要">{String(item.summary)}</DetailText><DetailText title="完整世界描述">{String(item.description)}</DetailText></>}
      {kind === 'stories' && <><DetailText title="简介">{String(item.summary)}</DetailText><div className="grid sm:grid-cols-2 gap-6"><DetailText title="世界"><Link className="text-blue-600" to={`/world/${item.worldId}`}>{library.worlds[String(item.worldId)]?.name}</Link></DetailText><DetailText title="主角（玩家）"><Link className="text-blue-600" to={`/characters/${item.playerId}`}>{library.characters[String(item.playerId)]?.name}</Link></DetailText></div><DetailText title="配角"><div className="flex flex-wrap gap-3">{(item.supportingIds as string[]).length ? (item.supportingIds as string[]).map(id => <Link className="text-blue-600" to={`/characters/${id}`} key={id}>{library.characters[id]?.name}</Link>) : '无初始配角'}</div></DetailText><DetailText title="开头消息">{String(item.opening)}</DetailText><p className="text-xs text-slate-400 border-t pt-5">修改后用于新开局，已经开始的存档保留自己的设定与进度。</p></>}
    </article>}
  </DetailShell>;
}
