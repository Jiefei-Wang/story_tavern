import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  X,
  Zap,
  Clock,
  Cpu,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  FileText,
} from "lucide-react";
import { GameTurn, TraceSpan } from "../../types";
import { useTraceStore } from "../../stores/useTraceStore";
import { AGENT_LABELS } from "./GenerationPanel";

interface GenerationTaskModalProps {
  turn: GameTurn;
  onClose: () => void;
}

export const GenerationTaskModal: React.FC<GenerationTaskModalProps> = ({ turn, onClose }) => {
  const traces = useTraceStore((s) => s.traces);
  const selectTrace = useTraceStore((s) => s.selectTrace);

  // Find the trace for this turn
  const trace = traces.find((t) => t.id === turn.traceId);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const spans = trace?.spans.filter((s) => s.type === "agent_call" || s.type === "input_parser" || s.type.startsWith('text_')) || [];
  const isInitTurn = turn.traceId === "trace_init" || turn.turnIndex === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 id="modal-title" className="font-semibold text-base text-slate-900 flex items-center gap-2">
                <span>{isInitTurn ? "开局剧情 · 生成任务" : `第 ${turn.turnIndex} 回合 · 生成任务过程`}</span>
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                {trace?.durationMs !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>总耗时 {(trace.durationMs / 1000).toFixed(2)}s</span>
                  </span>
                )}
                {Boolean(trace?.totalTokens) && (
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-slate-400" />
                    <span>消耗 {trace!.totalTokens.toLocaleString()} tokens</span>
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full text-[11px] ${
                    isInitTurn
                      ? "bg-slate-100 text-slate-600"
                      : trace?.status === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : trace?.status === "error"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {isInitTurn
                    ? "预设剧情"
                    : trace?.status === "success"
                    ? "已完成"
                    : trace?.status === "error"
                    ? "推演异常"
                    : "生成中…"}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            title="关闭窗口 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
          {/* Player Input Reminder */}
          {turn.playerInput &&
            turn.playerInput !== "(游戏开始)" &&
            turn.playerInput !== "(新游戏开始)" && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 text-xs">
                <span className="font-semibold text-blue-700 mr-2">你的行动:</span>
                <span className="text-slate-800 font-medium">{turn.playerInput}</span>
              </div>
            )}

          {/* If opening prologue without trace */}
          {isInitTurn && spans.length === 0 && (
            <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-medium text-slate-700">预设开局引导剧情</p>
              <p className="text-xs text-slate-400">此段剧情为世界线初始设定，无后台 Agent 实时生成任务记录。</p>
            </div>
          )}

          {/* If no trace found for ordinary turn */}
          {!isInitTurn && !trace && (
            <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="font-medium text-slate-700">未找到本回合生成记录</p>
              <p className="text-xs text-slate-400">Trace ID: {turn.traceId || "无"}</p>
            </div>
          )}

          {/* Span tasks list */}
          {spans.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>生成任务流水 ({spans.length} 个任务)</span>
                <span>各任务大模型产出详情</span>
              </div>

              {spans.map((span, sIdx) => (
                <SpanTaskItem key={span.id || sIdx} span={span} index={sIdx + 1} />
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div>
            {trace && (
              <Link
                to="/debug"
                onClick={() => {
                  selectTrace(trace.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>在调试台查看 Trace 图谱</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

interface SpanTaskItemProps {
  span: TraceSpan;
  index: number;
}

const SpanTaskItem: React.FC<SpanTaskItemProps> = ({ span, index }) => {
  const title = span.displayLabel || AGENT_LABELS[span.agentId || ""] || span.name;
  const content =
    span.liveContent ||
    (span.parsedOutput ? JSON.stringify(span.parsedOutput, null, 2) : "") ||
    (typeof span.rawResponse === "string" ? span.rawResponse : "");

  return (
    <details open className="group border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
      {/* Header */}
      <summary
        className="w-full px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer list-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-400">
            <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          </span>
          <span className="text-xs font-semibold text-slate-800 truncate">
            {index}. {title}
          </span>
          {span.model && (
            <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-mono shrink-0">
              {span.model}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 text-xs">
          {span.durationMs !== undefined && (
            <span className="text-[11px] text-slate-400 font-mono">{span.durationMs}ms</span>
          )}
          {Boolean(span.tokenUsage?.total) && (
            <span className="text-[11px] text-slate-400 font-mono">{span.tokenUsage!.total} tok</span>
          )}
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              span.status === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : span.status === "error"
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : span.generationStatus === "queued"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
          >
            {span.status === "success"
              ? "已完成"
              : span.status === "error"
              ? "失败"
              : span.generationStatus === "queued"
              ? "排队中"
              : "生成中…"}
          </span>
        </div>
      </summary>

      {/* Content */}
      <div className="p-3 border-t border-slate-100 bg-white space-y-2">
        {span.error && (
          <div className="p-2.5 bg-rose-50 text-rose-700 rounded-lg text-xs border border-rose-200 break-words">
            <span className="font-semibold">错误信息: </span>
            {span.error}
          </div>
        )}

        {content ? (
          <pre className="text-xs font-sans text-slate-700 leading-relaxed whitespace-pre-wrap break-words bg-slate-50/60 p-3 rounded-lg border border-slate-100 max-h-60 overflow-y-auto select-text">
            {content}
          </pre>
        ) : (
          <div className="text-xs text-slate-400 italic py-1 px-1">
            {span.status === "running" ? "正在接收大模型正文…" : span.status === "error" ? "无输出内容" : "等待处理…"}
          </div>
        )}
      </div>
    </details>
  );
};
