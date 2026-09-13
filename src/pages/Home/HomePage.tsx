import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useGameStore } from '../../stores/useGameStore';
import { useLibraryStore } from '../../stores/useLibraryStore';

export function HomePage() {
  const navigate = useNavigate();
  const { saves, selectSave, createNewSave, deleteSave, isExecuting } = useGameStore();
  const { record } = useLibraryStore();
  const story = record.data.selectedStoryId ? record.data.stories[record.data.selectedStoryId] : undefined;
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const start = async () => {
    setError('');
    try { await createNewSave(); navigate('/play'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('确定删除这个存档？此操作无法撤销。')) return;
    setDeleting(id); setError('');
    try { await deleteSave(id); } catch (e) { setError(String(e)); }
    finally { setDeleting(null); }
  };
  return <main className="library-page">
    <section className="library-panel relative overflow-hidden py-12 md:py-16">
      <div className="absolute -right-12 -top-20 w-80 h-80 rounded-full bg-blue-50/70 pointer-events-none"/>
      <div className="relative max-w-2xl space-y-6">
        <p className="library-eyebrow flex items-center gap-2"><BookOpen size={15}/>当前故事</p>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight text-slate-900">{story?.name || '下一段故事，从这里开始'}</h1>
        <p className="text-base text-slate-500 leading-8 whitespace-pre-wrap">{story?.summary || (story ? '这个故事等待你书写。' : '先选择一个故事，或到故事工坊创建自己的世界与人物。')}</p>
        <div className="flex flex-wrap gap-3 pt-4">
          <button className="library-primary" disabled={!story || isExecuting} onClick={start}><Play size={16}/>{isExecuting ? '请等待当前操作完成' : '开始故事'}</button>
          <Link className="library-secondary" to="/stories?select=1"><RefreshCw size={15}/>更换故事</Link>
          {story && <Link className="text-sm text-slate-500 inline-flex items-center px-2 hover:text-blue-600" to={`/stories/${story.id}`}>故事详情<ArrowRight size={15} className="ml-1"/></Link>}
        </div>
      </div>
    </section>
    {error && <p role="alert" className="text-red-700 bg-red-50 p-4 rounded-xl text-sm">{error}</p>}
    <section className="space-y-5"><header className="flex items-center justify-between"><h2 className="text-lg font-semibold">最近存档</h2><span className="text-xs text-slate-400">{saves.length} 个存档</span></header>
      {!saves.length ? <div className="library-panel text-center text-sm text-slate-400 py-12">还没有存档。开始故事，写下第一段经历。</div> : <div className="space-y-3">{[...saves].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(save => <article key={save.id} className="flex items-center bg-white border border-slate-200 rounded-2xl hover:border-blue-300 transition-colors">
        <button className="flex-1 min-w-0 text-left p-5 rounded-2xl focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50" disabled={deleting === save.id} onClick={() => { selectSave(save.id); navigate('/play'); }}>
          <h3 className="text-sm font-semibold text-slate-800">{save.storyInfo?.title || save.name}</h3>
          <p className="text-sm text-slate-500 line-clamp-1 mt-2">{save.turns.at(-1)?.narratorOutput || save.storyInfo?.summary || '故事刚刚开始'}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-3"><Clock size={12}/>{new Date(save.updatedAt).toLocaleString('zh-CN')}</p>
        </button>
        <button aria-label={`删除存档：${save.name}`} title="删除存档" className="p-3 mr-4 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={isExecuting || !!deleting} onClick={() => remove(save.id)}><Trash2 size={16}/></button>
      </article>)}</div>}
    </section>
  </main>;
}
