import type { ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Collection({ title, description, count, createHref, children }: { title: string; description: string; count: number; createHref: string; children: ReactNode }) {
  return <main className="library-page"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="library-eyebrow">故事工坊 · {count} 项</p><h1 className="library-title">{title}</h1><p className="mt-3 text-sm text-slate-500 leading-6">{description}</p></div><Link className="library-primary" to={createHref}><Plus size={16}/>新建{title}</Link></header>{children}</main>;
}
export function CollectionCard({ href, title, description, image, label }: { href: string; title: string; description: string; image?: string; label?: string }) {
  return <Link to={href} className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-blue-500">
    {image && <img src={image} alt="" className="w-full h-40 object-cover"/>}<div className="p-6 space-y-3"><div className="flex justify-between gap-3"><h2 className="font-semibold text-lg text-slate-900 break-words">{title}</h2><ArrowUpRight size={18} className="shrink-0 text-slate-300 group-hover:text-blue-600 mt-1"/></div><p className="text-sm text-slate-500 whitespace-pre-wrap leading-7 line-clamp-3 min-h-[5.25rem]">{description || '暂无简介'}</p>{label && <p className="text-xs text-blue-600 pt-2">{label}</p>}</div>
  </Link>;
}
export function DetailShell({ backHref, backLabel, title, actions, children }: { backHref: string; backLabel: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return <main className="library-page"><Link className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600" to={backHref}><ArrowLeft size={16}/>{backLabel}</Link><header className="flex flex-wrap items-center justify-between gap-4"><h1 className="library-title">{title}</h1><div className="flex flex-wrap gap-2">{actions}</div></header>{children}</main>;
}
export function DetailText({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h2 className="font-semibold text-sm text-slate-900">{title}</h2><div className="whitespace-pre-wrap text-sm text-slate-600 leading-8 break-words">{children || '尚未填写'}</div></section>;
}
