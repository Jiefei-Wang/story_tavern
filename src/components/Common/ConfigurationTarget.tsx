import { useState } from 'react';
import { useRepositoryStore } from '../../stores/useRepositoryStore';

export function ConfigurationTarget({ disabled = false }: { disabled?: boolean }) {
  const repo = useRepositoryStore(); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const dirty = JSON.stringify(repo.draft) !== JSON.stringify(repo.record?.data ?? null);
  const run = async (action: () => Promise<void>, success = '') => {
    setMessage(''); setError('');
    try { await action(); setMessage(success); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  if (!import.meta.env.DEV || '__TAURI_INTERNALS__' in window) return null;
  return <section className="rounded-lg border bg-white p-3 space-y-2 text-sm">
    <div className="flex flex-wrap gap-3 items-center">
      <label>编辑目标：<select aria-label="编辑目标" disabled={disabled || repo.busy} value={repo.target} onChange={e => {
        const target = e.target.value as 'local' | 'repository';
        void run(async () => {
          if (target === 'repository' && !repo.record) await repo.load();
          useRepositoryStore.setState({ target });
        });
      }}><option value="local">本机配置</option><option value="repository">仓库默认</option></select></label>
      {repo.target === 'repository' && <>
        <button disabled={disabled || repo.busy || !dirty} onClick={() => void run(() => repo.save(), '已保存仓库文件')} className="rounded bg-blue-600 text-white px-3 py-1 disabled:opacity-50">保存仓库修改</button>
        <button disabled={disabled || repo.busy} onClick={() => { if (!dirty || window.confirm('重新载入会丢弃未保存的仓库修改，继续？')) void run(repo.load, '已重新载入仓库'); }}>重新载入</button>
        <button disabled={disabled || repo.busy || dirty} onClick={() => void run(repo.apply, '仓库 Agent 与组已应用到本机')} className="border rounded px-3 py-1 disabled:opacity-50">应用到本机</button>
      </>}
    </div>
    <p className="text-xs text-slate-500">{repo.target === 'repository' ? '编辑仓库草稿，点击“保存仓库修改”统一落盘。Agent 表单先点击“更新 Agent 草稿”。应用到本机会更新同 ID 的 Agent 与组，保留其他配置、存档和当前组选择。' : '编辑本机存储中的配置。'}{dirty && ' 仓库有未保存的修改。'}</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-rose-600">{error}</p>}
  </section>;
}
