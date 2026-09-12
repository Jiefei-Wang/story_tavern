import React, { useState } from "react";
import { sanitizeExtraBody } from "../../engine/runtime/AgentRuntime";

export function parseExtraBody(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text.trim() || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("extraBody 必须是 JSON 对象，不能是数组、null 或其他值。");
  }
  return sanitizeExtraBody(value as Record<string, unknown>);
}

export function ExtraBodyEditor({ value, onSave }: {
  value?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const text = draft ?? JSON.stringify(value ?? {}, null, 2);
  const save = async () => {
    try {
      const parsed = parseExtraBody(text);
      setSaving(true);
      await onSave(parsed);
      setDraft(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  return <div className="mt-4 space-y-2 max-w-3xl">
    <label className="block text-xs font-semibold text-slate-700">
      Request extraBody（JSON 对象）
      <textarea aria-label="Request extraBody" rows={7} value={text} disabled={saving}
        onChange={(e) => { setDraft(e.target.value); setError(""); }}
        className="mt-2 w-full font-mono text-xs bg-white border border-slate-200 rounded-lg p-3 outline-none focus:border-blue-500" />
    </label>
    <p className="text-xs text-slate-500">手动添加、修改或删除请求字段，支持嵌套对象。保存后生效；空对象清除本组额外字段。按顶层字段覆盖 Agent 默认 extraBody，手动 reasoning_effort 优先于强度选择。核心字段 model、messages、temperature、max_tokens、top_p、stream 请使用对应设置。</p>
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    <div className="flex items-center gap-3 text-xs">
      <button disabled={saving} onClick={save} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">{saving ? "保存中…" : "保存 extraBody"}</button>
      <button disabled={saving} onClick={() => { setDraft("{}"); setError(""); }} className="text-slate-600">清空</button>
      <button disabled={saving} onClick={() => { setDraft(null); setError(""); }} className="text-slate-600">还原已保存</button>
      {draft !== null && <span className="text-amber-700">尚未保存</span>}
    </div>
  </div>;
}
