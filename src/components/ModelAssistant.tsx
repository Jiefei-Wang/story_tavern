import { readPreference, writePreference } from '../db/preferences';
import React, { useEffect, useRef, useState } from "react";
import { Bot, X } from "lucide-react";

import { readAssistantConfiguration, executeAssistantChanges } from "../engine/assistantConfiguration";
import { useBackendStore } from "../stores/useBackendStore";
import { ChatMessage, requestAssistant } from "../engine/modelAssistant";

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const backends = useBackendStore(s => s.backends);
  const [backendId, setBackendId] = useState(() => readPreference("model_assistant_backend") || "");
  const [model, setModel] = useState(() => readPreference("model_assistant_model") || "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const backend = backends.find(b => b.id === backendId && b.enabled);
  useEffect(() => { const timer = setTimeout(() => { void Promise.all([writePreference("model_assistant_backend", backendId), writePreference("model_assistant_model", model)]).catch(e => setError(String(e))); }, 300); return () => clearTimeout(timer); }, [backendId, model]);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy, open]);
  useEffect(() => () => { running.current?.abort(); }, []);

  const send = async () => {
    if (!backend || !model.trim() || !input.trim() || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true); setError("");
    const history: ChatMessage[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(history); setInput("");
    const outcomes: string[] = [];
    try {
      await writePreference("model_assistant_backend", backendId);
      await writePreference("model_assistant_model", model);
      const config = readAssistantConfiguration();
      const result = await requestAssistant(backend, model, history, config, controller.signal);
      await executeAssistantChanges(result, config, controller.signal, message => outcomes.push(message));
      setMessages([...history, { role: "assistant", content: [result.reply, ...outcomes].filter(Boolean).join("\n\n") || "本次未修改配置。" }]);
    } catch (err) {
      const detail = controller.signal.aborted ? "请求已停止。" : err instanceof Error ? err.message : String(err);
      const content = [...outcomes, `执行结果：${detail}`, outcomes.length ? "后续操作未完成，以上已保存操作仍然有效。" : "没有完成任何配置保存。"].join("\n");
      setError(detail);
      setMessages([...history, { role: "assistant", content }]);
    } finally { setBackendId(readPreference("model_assistant_backend") || ""); setModel(readPreference("model_assistant_model") || ""); running.current = null; setBusy(false); }
  };

  const field = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50";
  return <>
    <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100">
      <Bot className="w-4 h-4 text-blue-600" />AI 助手
    </button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="model-assistant-title" className="w-[min(850px,95vw)] h-[85vh] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-900/40">
      <div className="flex flex-col h-full text-slate-800">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="model-assistant-title" className="font-bold">AI 助手</h2>
          <button aria-label="关闭AI 助手" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs space-y-1">助手 Backend<select aria-label="助手 Backend" disabled={busy} value={backendId} onChange={e => { const b = backends.find(b => b.id === e.target.value); setBackendId(e.target.value); setModel(b?.defaultModel || b?.models?.[0] || ""); }} className={`${field} w-full block`}>
              <option value="">请选择 Backend</option>{backends.filter(b => b.enabled).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
            <label className="text-xs space-y-1">助手模型<input aria-label="助手模型" disabled={busy} className={`${field} w-full block`} list="assistant-models" value={model} onChange={e => setModel(e.target.value)} placeholder="选择或输入模型 ID" /></label>
            <datalist id="assistant-models">{backend?.models?.map(m => <option key={m} value={m} />)}</datalist>
          </div>
          <p className="text-xs text-slate-500">助手可调整角色、世界、故事库、本局设定、系统设置和模型配置。修改保存到桌面与浏览器共用的本地数据库；凭证使用安全表单，历史回合不可编辑。</p>
          {!backend && <p className="text-xs text-amber-700">请先在 Backends 中保存并启用服务，再选择助手 Backend。</p>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" aria-live="polite">
          {!messages.length && <p className="text-sm text-slate-500">例如：开启自动保存；把当前场景改成雨夜；让艾琳说话更克制；创建一个新的故事；为 Agent 组更换模型。也可以先让我分析当前配置。</p>}
          {messages.map((m, i) => <div key={i} className={`p-3 rounded-xl text-sm whitespace-pre-wrap break-words ${m.role === "user" ? "bg-blue-50 ml-8" : "bg-slate-100 mr-8"}`}><div className="text-xs font-semibold mb-2">{m.role === "user" ? "你" : "AI 助手"}</div>{m.content}</div>)}
          {busy && <p className="text-sm text-blue-600">正在分析并执行配置指令…</p>}
          <div ref={end} />
        </div>
        <form className="p-4 border-t space-y-2" onSubmit={e => { e.preventDefault(); void send(); }}>
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
          <textarea aria-label="给AI 助手的指令" className={`${field} w-full resize-none`} rows={3} value={input} onChange={e => setInput(e.target.value)} placeholder="输入配置指令…" />
          <div className="flex justify-between">
            <button type="button" disabled={busy} className="text-xs text-slate-500 disabled:opacity-50" onClick={() => { setMessages([]); setError(""); }}>清空对话</button>
            {busy ? <button type="button" className={field} onClick={() => running.current?.abort()}>停止</button> : <button disabled={!backend || !model.trim() || !input.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">发送并执行</button>}
          </div>
        </form>
      </div>
    </dialog>
  </>;
}
