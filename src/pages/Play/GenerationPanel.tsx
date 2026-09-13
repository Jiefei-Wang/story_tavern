import React, { useEffect, useRef } from "react";
import { Square } from "lucide-react";
import { useTraceStore } from "../../stores/useTraceStore";
import { TurnTrace, TraceSpan } from "../../types";

export const AGENT_LABELS: Record<string, string> = {
  text_router: '命令路由 · 选择人物',
  text_designer: 'Designer · 设计人物反应',
  text_storyteller: 'Narrator · 整合故事',
  text_organizer: '组织时间线与感知',
  text_character: '人物自然回应',
  text_editor: '暂存文档修改',
  text_narrator: '撰写正文草稿',
  input_compiler: "理解你的行动",
  admin_patch: "执行管理员指令",
  perception: "观察场景",
  npc_reaction: "角色反应",
  world_resolver: "结算变化",
  time_skip: "时间流逝",
  character_generator: "人物生成",
  narrator: "撰写旁白",
};

export function LiveContent({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (ref.current && follow.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      onScroll={() => {
        const el = ref.current;
        if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="border-t border-slate-100 p-3 text-xs leading-6 whitespace-pre-wrap break-words max-h-64 overflow-auto font-sans text-slate-700"
    >
      {text}
    </pre>
  );
}

export function isGenerationRunning(
  traceId: string | null,
  running: boolean,
  traces: TurnTrace[]
): boolean {
  if (!running) return false;
  const trace = traces.find((t) => t.id === traceId);
  return !trace || trace.status === "running";
}

export function GenerationPanel({
  traceId,
  running,
  onStop,
}: {
  traceId: string | null;
  running: boolean;
  onStop?: () => void;
}) {
  const traces = useTraceStore((s) => s.traces);
  const trace = traces.find((t) => t.id === traceId);
  const isCurrentlyRunning = isGenerationRunning(traceId, running, traces);

  // 生成完毕后自动隐去
  if (!isCurrentlyRunning) return null;

  const tasks = trace?.spans.filter((s: TraceSpan) => s.type === "agent_call") || [];
  const active = tasks.filter((s: TraceSpan) => s.status === "running");

  return (
    <details key={traceId || "pending"} open className="group max-w-3xl mx-auto rounded-xl border border-blue-200 bg-blue-50/60 text-sm shadow-sm">
      <summary className="cursor-pointer p-3.5 text-blue-800 flex items-center justify-between list-none select-none">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="transition-transform group-open:rotate-90 text-blue-500 font-bold">▸</span>
          <span className="font-medium text-blue-900">正在生成任务</span>
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping" />
        </div>
        <div className="flex items-center gap-3">
          {onStop && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 rounded-md text-xs font-medium flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
              title="暂停生成并恢复输入框内容"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>暂停生成</span>
            </button>
          )}
          <span className="text-xs text-blue-600 font-normal" aria-live="polite">
            {active.length > 1
              ? `${active.length} 个任务并行中`
              : active.length
              ? "1 个任务处理中"
              : "准备中…"}
            · 点击收起/展开
          </span>
        </div>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-xs text-slate-500">各任务正在实时接收大模型输出，生成完毕后将自动入库并隐去本栏。</p>
        {!tasks.length && <p className="text-xs text-slate-500 italic">正在准备本轮推演管线…</p>}
        {tasks.map(task => (
          <section key={task.id} aria-label={task.displayLabel || AGENT_LABELS[task.agentId || ""] || task.name} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
            <div className="px-3 py-2 flex justify-between gap-3 text-xs font-medium bg-slate-50/50">
              <span className="text-slate-800">{task.displayLabel || AGENT_LABELS[task.agentId || ""] || task.name}</span>
              <span className={task.status === "error" ? "text-rose-600 font-semibold" : task.status === "success" ? "text-emerald-600" : "text-blue-600"}>
                {task.status === "success" ? "已完成" : task.status === "error" ? "失败" : task.generationStatus === "queued" ? "排队中" : "生成中…"}
              </span>
            </div>
            <LiveContent text={task.liveContent || (task.status === "error" ? "未收到正文" : "等待内容…")} />
            {task.error && <p className="px-3 pb-3 text-xs text-rose-600 break-words">{task.error}</p>}
          </section>
        ))}
      </div>
    </details>
  );
}
