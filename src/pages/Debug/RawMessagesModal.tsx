import React, { useMemo, useState } from "react";
import { X, Copy, Check, MessageSquare } from "lucide-react";
import { TurnTrace, TraceSpan } from "../../types";

interface RawMessage {
  role: string;
  content: string;
}

interface SpanMessages {
  spanId: string;
  spanName: string;
  agentId?: string;
  model?: string;
  startedAt: number;
  messages: RawMessage[];
}

interface RawMessagesModalProps {
  trace: TurnTrace;
  onClose: () => void;
}

function formatMessagesAsText(groups: SpanMessages[]): string {
  return groups
    .map((g) => {
      const header = `=== ${g.spanName}${g.model ? ` [${g.model}]` : ""} ===`;
      const msgs = g.messages
        .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
        .join("\n\n---\n\n");
      return `${header}\n\n${msgs}`;
    })
    .join("\n\n" + "=".repeat(60) + "\n\n");
}

export function RawMessagesModal({ trace, onClose }: RawMessagesModalProps) {
  const [copied, setCopied] = useState(false);

  const spanGroups = useMemo<SpanMessages[]>(() => {
    return trace.spans
      .filter((s: TraceSpan) => {
        const msgs = s.resolvedMessages as RawMessage[] | null | undefined;
        return Array.isArray(msgs) && msgs.length > 0;
      })
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((s: TraceSpan) => ({
        spanId: s.id,
        spanName: s.displayLabel || s.name,
        agentId: s.agentId,
        model: s.model,
        startedAt: s.startedAt,
        messages: s.resolvedMessages as RawMessage[],
      }));
  }, [trace]);

  const handleCopy = async () => {
    const text = formatMessagesAsText(spanGroups);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roleColors: Record<string, string> = {
    system: "bg-violet-50 border-violet-200 text-violet-800",
    user: "bg-blue-50 border-blue-200 text-blue-800",
    assistant: "bg-emerald-50 border-emerald-200 text-emerald-800",
  };

  const roleLabels: Record<string, string> = {
    system: "SYSTEM",
    user: "USER",
    assistant: "ASSISTANT",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-sm text-slate-800">
              Raw Messages — Turn #{trace.turnNumber}
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              {spanGroups.length} 个 Agent 调用
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  一键复制全部
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {spanGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">该 Trace 没有已解析的 LLM 消息</p>
            </div>
          ) : (
            spanGroups.map((group, groupIdx) => (
              <div key={group.spanId}>
                {/* Span header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-400 font-mono">
                    #{groupIdx + 1}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-700">
                    {group.spanName}
                  </h3>
                  {group.model && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-500 font-mono">
                      {group.model}
                    </span>
                  )}
                  {group.agentId && (
                    <span className="text-xs text-slate-400">
                      ({group.agentId})
                    </span>
                  )}
                </div>

                {/* Messages */}
                <div className="space-y-2 pl-5">
                  {group.messages.map((msg, msgIdx) => {
                    const colorClass =
                      roleColors[msg.role] ||
                      "bg-slate-50 border-slate-200 text-slate-700";
                    const colorParts = colorClass.split(" ");
                    const label =
                      roleLabels[msg.role] || msg.role.toUpperCase();
                    return (
                      <div
                        key={msgIdx}
                        className={`rounded-lg border p-3 ${colorParts[0]} ${colorParts[1]}`}
                      >
                        <div
                          className={`text-[10px] font-bold font-mono mb-1.5 ${colorParts[2]}`}
                        >
                          {label}
                        </div>
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-sans leading-relaxed select-text">
                          {msg.content}
                        </pre>
                      </div>
                    );
                  })}
                </div>

                {/* Divider between groups */}
                {groupIdx < spanGroups.length - 1 && (
                  <div className="mt-6 border-t border-dashed border-slate-200" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
