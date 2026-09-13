import React, { useState, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  NodeProps,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  GitFork,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  ChevronRight,
  Layers,
  Server,
  FileCode,
  Activity,
  Code,
  MessageSquare,
} from "lucide-react";
import { TraceSpan, TurnTrace } from "../../types";
import { useTraceStore } from "../../stores/useTraceStore";
import { JsonViewer } from "../../components/Common/JsonViewer";
import { groupRequests, validationLabel } from "./traceRequests";
import { RawMessagesModal } from "./RawMessagesModal";

// Custom React Flow Node Component
const AgentFlowNode: React.FC<any> = ({ data }) => {
  const { span, isSelected, onClick } = data;
  const status = span?.status || "pending";

  const statusBg =
    status === "success"
      ? "border-emerald-500/80 bg-emerald-50/40 text-emerald-900"
      : status === "running"
      ? "border-blue-500 bg-blue-50/50 text-blue-900 animate-pulse"
      : status === "error"
      ? "border-rose-500 bg-rose-50 text-rose-900"
      : "border-slate-300 bg-slate-50 text-slate-600";

  const badgeColor =
    status === "success"
      ? "bg-emerald-500"
      : status === "running"
      ? "bg-blue-500"
      : status === "error"
      ? "bg-rose-500"
      : "bg-slate-300";

  return (
    <div
      onClick={onClick}
      className={`px-3.5 py-2.5 rounded-xl border-2 shadow-sm transition-all cursor-pointer min-w-[170px] ${statusBg} ${
        isSelected ? "ring-2 ring-blue-500 shadow-md scale-105" : "hover:border-blue-400"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />

      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-bold text-xs truncate">{data.label}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${badgeColor}`} />
      </div>

      <div className="space-y-0.5 text-[10px] text-slate-500 font-mono">
        {span?.model && <div className="truncate text-blue-600 font-semibold">{span.model}</div>}
        <div className="flex items-center justify-between text-slate-400 pt-0.5">
          <span>{span?.durationMs ? `${span.durationMs}ms` : "0ms"}</span>
          <span>{span?.tokenUsage?.total ? `${span.tokenUsage.total} tok` : ""}</span>
        </div>
      </div>

      {data.validations?.map((v: TraceSpan) => <div key={v.id} className={`text-[10px] mt-1 ${v.status === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>{validationLabel(v)}</div>)}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" />
    </div>
  );
};

const nodeTypes = {
  agentNode: AgentFlowNode,
};

export const DebugPage: React.FC = () => {
  const {
    traces,
    selectedTraceId,
    selectTrace,
    selectedSpanId,
    selectSpan,
    activeTab,
    setActiveTab,
    getSelectedTrace,
    getSelectedSpan,
  } = useTraceStore();

  const [inspectorTab, setInspectorTab] = useState<
    "overview" | "input" | "prompt" | "response" | "output" | "diff" | "error"
  >("output");
  const [showRawMessages, setShowRawMessages] = useState(false);

  const currentTrace = getSelectedTrace();
  const requestGroups = useMemo(() => groupRequests(currentTrace?.spans || []), [currentTrace]);
  const selectedGroup = requestGroups.find(g => g.request.id === selectedSpanId || g.validations.some(v => v.id === selectedSpanId));
  const selectedSpan = selectedGroup?.request || getSelectedSpan();
  useEffect(() => setInspectorTab("output"), [selectedSpanId]);

  useEffect(() => {
    if (selectedTraceId === null && traces.length > 0) selectTrace(traces[0].id);
  }, [selectedTraceId, traces, selectTrace]);

  // Construct React Flow Nodes & Edges from currentTrace
  const { nodes, edges } = useMemo(() => {
    if (!currentTrace || currentTrace.spans.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nList: Node[] = [];
    const eList: Edge[] = [];

    // Player Input root
    nList.push({
      id: "node_input",
      type: "agentNode",
      position: { x: 300, y: 20 },
      data: {
        label: "Player Input",
        span: { status: "success", durationMs: 0 },
        isSelected: selectedSpanId === "node_input",
        onClick: () => selectSpan(null),
      },
    });

    for (const [index, { request: span, validations }] of requestGroups.entries()) {
      nList.push({ id: span.id, type: 'agentNode', position: { x: 300, y: 110 + index * 110 }, data: {
        label: span.displayLabel || span.name, span, validations, isSelected: selectedSpan?.id === span.id, onClick: () => selectSpan(span.id),
      } });
      eList.push({ id: `request_${index}`, source: index ? requestGroups[index - 1].request.id : 'node_input', target: span.id, label: '调用开始顺序（可重叠）' });
    }
    return { nodes: nList, edges: eList };
  }, [currentTrace, selectedSpanId, requestGroups, selectSpan]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Bar: Trace Switcher & Metrics */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GitFork className="w-5 h-5 text-blue-600" />
            <h1 className="font-bold text-sm text-slate-900">
              Agent Graph / Trace 调试器
            </h1>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Trace Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">选择回合:</span>
            <select
              value={selectedTraceId || ""}
              onChange={(e) => selectTrace(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 font-mono text-xs text-slate-700 outline-none"
            >
              {traces.map((t, idx) => (
                <option key={t.id} value={t.id}>
                  Turn #{t.turnNumber} ({new Date(t.startedAt).toLocaleTimeString("zh-CN")}) -{" "}
                  {t.playerInput.slice(0, 15)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trace Overview Badges */}
        {currentTrace && (
          <div className="flex items-center gap-3 text-xs">
            <span
              className={`px-2 py-0.5 rounded font-medium ${
                currentTrace.status === "success"
                  ? "bg-emerald-100 text-emerald-800"
                  : currentTrace.status === "running"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {currentTrace.status === "success"
                ? "推演成功"
                : currentTrace.status === "running"
                ? "推演中..."
                : "推演异常"}
            </span>

            <span className="text-slate-500 font-mono">
              耗时: {currentTrace.durationMs || 0}ms
            </span>
            <span className="text-slate-500 font-mono">
              Tokens: {currentTrace.totalTokens || 0}
            </span>

            {/* View switcher tabs */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setActiveTab("graph")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "graph"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                拓扑图 (Graph)
              </button>
              <button
                onClick={() => setActiveTab("timeline")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "timeline"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                并发时序 (Timeline)
              </button>
            </div>

            {/* Raw Messages Button */}
            <button
              onClick={() => setShowRawMessages(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              查看 Raw Messages
            </button>
          </div>
        )}
      </div>

      {/* Main Debug Workspace */}
      {currentTrace?.status === 'error' && !currentTrace.spans.some(s => s.error) && <p role="alert" className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-xs text-amber-800">这条旧 Trace 未记录具体失败原因。可查看各次模型输出与格式重试请求；后续失败会记录关联校验与错误详情。</p>}
      {currentTrace && currentTrace.spans.some(s => s.error) && <div className="border border-rose-200 bg-rose-50 rounded-xl p-3 text-xs text-rose-800 space-y-2 max-h-36 overflow-y-auto shrink-0" role="alert">
        <p className="font-semibold">{currentTrace.status === 'error' ? '本轮失败，以下步骤发生错误' : '以下步骤曾失败，请查看重试结果'}</p>
        {currentTrace.spans.filter(s => s.error).map(s => <button key={s.id} className="block text-left hover:underline whitespace-pre-wrap" onClick={() => { selectSpan(s.id); setInspectorTab('overview'); }}>{s.name}：{s.error}</button>)}
      </div>}
      <div className="flex-1 flex gap-4 overflow-x-auto">
        {/* Left: React Flow Graph or Timeline View */}
        <div className="flex-1 min-w-[280px] bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative">
          {activeTab === "graph" ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#cbd5e1" gap={16} />
              <Controls />
            </ReactFlow>
          ) : (
            /* Timeline Gantt View */
            <div className="p-6 h-full overflow-y-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                <span className="font-bold text-slate-800">
                  执行时序图 (Gantt Timeline) - 点击条形可查看对应节点
                </span>
                <span className="text-slate-400">总跨度: {currentTrace?.durationMs || 0}ms</span>
              </div>

              <div className="space-y-3 pt-2">
                {requestGroups.map(({ request: span, validations }) => {
                  const traceStart = currentTrace?.startedAt ?? span.startedAt;
                  const totalSpanDuration = Math.max(currentTrace?.durationMs || 100, 100);
                  const offsetMs = Math.max(0, span.startedAt - traceStart);
                  const spanDur = Math.max(span.durationMs || 50, 40);

                  const leftPct = Math.min((offsetMs / totalSpanDuration) * 100, 90);
                  const widthPct = Math.min((spanDur / totalSpanDuration) * 100, 100 - leftPct);
                  const isSelected = selectedSpanId === span.id;

                  return (
                    <div
                      key={span.id}
                      onClick={() => selectSpan(span.id)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-400"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                        <span className="text-slate-800">{span.name}{validations.map(v => ` · ${validationLabel(v)}`).join('')}</span>
                        <div className="flex items-center gap-3 text-slate-400 text-[11px] font-mono">
                          <span>{span.model}</span>
                          <span>{span.durationMs || 0}ms</span>
                        </div>
                      </div>

                      {/* Bar Container */}
                      <div className="h-4 bg-slate-200 rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{
                            marginLeft: `${leftPct}%`,
                            width: `${Math.max(widthPct, 5)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Inspector Drawer */}
        {selectedSpan && (
          <div className="w-80 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-right-10 duration-150">
            {/* Inspector Header */}
            <div className="h-12 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800">
                  {selectedSpan.name}
                </span>
                <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  {selectedSpan.agentId}
                </span>
              </div>
              <button
                onClick={() => selectSpan(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inspector Tabs */}
            <div className="flex items-center gap-1 px-3 border-b border-slate-100 text-xs shrink-0 overflow-x-auto">
              <button
                onClick={() => setInspectorTab("overview")}
                className={`py-2 px-2 border-b-2 font-medium ${
                  inspectorTab === "overview"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                概览
              </button>
              <button
                onClick={() => setInspectorTab("input")}
                className={`py-2 px-2 border-b-2 font-medium ${
                  inspectorTab === "input"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                输入
              </button>
              <button
                onClick={() => setInspectorTab("prompt")}
                className={`py-2 px-2 border-b-2 font-medium ${
                  inspectorTab === "prompt"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                Request
              </button>
              <button
                onClick={() => setInspectorTab("response")}
                className={`py-2 px-2 border-b-2 font-medium ${
                  inspectorTab === "response"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                原始响应
              </button>
              <button
                onClick={() => setInspectorTab("output")}
                className={`py-2 px-2 border-b-2 font-medium ${
                  inspectorTab === "output"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500"
                }`}
              >
                解析结果
              </button>
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {inspectorTab === "overview" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">耗时 (Latency)</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {selectedSpan.durationMs || 0}ms
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">Token 消耗</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {selectedSpan.tokenUsage?.total || 0}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 p-3 bg-slate-50 rounded-lg border border-slate-100 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Backend:</span>
                      <span className="text-slate-700">{selectedSpan.backendId || "Local/Mock"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Model:</span>
                      <span className="text-slate-700">{selectedSpan.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span className="text-slate-700 uppercase font-bold">{selectedSpan.status}</span>
                    </div>
                  </div>

                  {["intent_filter", "narrator_validation", "public_event_validation"].includes(selectedSpan.type) && (
                    <div className="space-y-2">
                      <span className="font-semibold">权限与事实校验</span>
                      <JsonViewer data={selectedSpan.inputContext} />
                      <JsonViewer data={selectedSpan.parsedOutput ?? selectedSpan.liveContent ?? selectedSpan.rawResponse} />
                    </div>
                  )}
                  {selectedSpan.error && (
                    <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200">
                      <span className="font-bold block mb-1">执行错误:</span>
                      <pre className="whitespace-pre-wrap font-mono text-[10px]">
                        {selectedSpan.error}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {inspectorTab === "input" && (
                <JsonViewer data={selectedSpan.inputContext} />
              )}

              {inspectorTab === "prompt" && (
                <div className="space-y-4">
                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">
                      实际 Request:
                    </span>
                    <JsonViewer data={{ ...(selectedSpan.requestParams as object || {}), messages: selectedSpan.resolvedMessages }} />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 block mb-1">
                      原始模板 Messages:
                    </span>
                    <JsonViewer data={selectedSpan.templateMessages} />
                  </div>
                </div>
              )}

              {inspectorTab === "response" && (
                <JsonViewer data={selectedSpan.rawResponse} />
              )}

              {inspectorTab === "output" && (
                <JsonViewer data={selectedSpan.parsedOutput ?? selectedSpan.liveContent ?? selectedSpan.rawResponse} />
              )}
            </div>
          </div>
        )}
        {selectedGroup && selectedGroup.validations.length > 0 && (
          <aside className="w-80 shrink-0 bg-white border border-slate-200 rounded-2xl overflow-y-auto p-4 space-y-4">
            {selectedGroup.validations.map(validation => <section key={validation.id} className="space-y-3 text-xs">
              <h3 className={`font-mono font-bold ${validation.status === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>{validationLabel(validation)}</h3>
              <p className="text-slate-500">{validation.name}</p>
              {validation.error && <p className="whitespace-pre-wrap text-rose-700">{validation.error}</p>}
              <JsonViewer data={validation.parsedOutput} />
            </section>)}
          </aside>
        )}
      </div>

      {/* Raw Messages Modal */}
      {showRawMessages && currentTrace && (
        <RawMessagesModal
          trace={currentTrace}
          onClose={() => setShowRawMessages(false)}
        />
      )}
    </div>
  );
};
