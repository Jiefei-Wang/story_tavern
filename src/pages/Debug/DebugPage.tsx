import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import { TraceSpan, TurnTrace } from "../../types";
import { useTraceStore } from "../../stores/useTraceStore";
import { JsonViewer } from "../../components/Common/JsonViewer";

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
  >("overview");

  const currentTrace = getSelectedTrace();
  const selectedSpan = getSelectedSpan();

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

    const spans = currentTrace.spans;

    let prevNodeId = "node_input";
    let currentY = 110;

    // 1. Input Compiler
    const inputCompiler = spans.find((s) => s.agentId === "input_compiler");
    if (inputCompiler) {
      nList.push({
        id: inputCompiler.id,
        type: "agentNode",
        position: { x: 350, y: currentY },
        data: {
          label: "Input Compiler",
          span: inputCompiler,
          isSelected: selectedSpanId === inputCompiler.id,
          onClick: () => selectSpan(inputCompiler.id),
        },
      });
      eList.push({
        id: `e_input_${inputCompiler.id}`,
        source: "node_input",
        target: inputCompiler.id,
        animated: inputCompiler.status === "running",
      });
      prevNodeId = inputCompiler.id;
      currentY += 100;
    }

    // 2. Discover distinct TemporalBlocks from spans
    const blockSpans = spans.filter(
      (s) => s.agentId !== "input_compiler" && s.agentId !== "narrator"
    );

    // Group spans by blockId or sequential execution
    const blockMap = new Map<string, TraceSpan[]>();
    for (const s of blockSpans) {
      const bKey = s.blockId || s.parentId || "default_block";
      if (!blockMap.has(bKey)) {
        blockMap.set(bKey, []);
      }
      blockMap.get(bKey)!.push(s);
    }

    // Render each block group
    for (const [blockKey, bSpans] of blockMap.entries()) {
      bSpans.sort((a, b) => a.startedAt - b.startedAt);

      const adminSpan = bSpans.find((s) => s.agentId === "admin_patch");
      const timeSkipSpan = bSpans.find((s) => s.agentId === "time_skip");
      const perceptionSpan = bSpans.find((s) => s.agentId === "perception");
      const npcSpans = bSpans.filter((s) => s.agentId === "npc_reaction");
      const resolverSpan = bSpans.find((s) => s.agentId === "world_resolver");

      if (adminSpan) {
        nList.push({
          id: adminSpan.id,
          type: "agentNode",
          position: { x: 350, y: currentY },
          data: {
            label: "Admin Patch",
            span: adminSpan,
            isSelected: selectedSpanId === adminSpan.id,
            onClick: () => selectSpan(adminSpan.id),
          },
        });
        eList.push({
          id: `e_${prevNodeId}_${adminSpan.id}`,
          source: prevNodeId,
          target: adminSpan.id,
        });
        prevNodeId = adminSpan.id;
        currentY += 100;
      } else if (timeSkipSpan) {
        nList.push({
          id: timeSkipSpan.id,
          type: "agentNode",
          position: { x: 350, y: currentY },
          data: {
            label: "Time Skip",
            span: timeSkipSpan,
            isSelected: selectedSpanId === timeSkipSpan.id,
            onClick: () => selectSpan(timeSkipSpan.id),
          },
        });
        eList.push({
          id: `e_${prevNodeId}_${timeSkipSpan.id}`,
          source: prevNodeId,
          target: timeSkipSpan.id,
        });
        prevNodeId = timeSkipSpan.id;
        currentY += 100;
      } else {
        // Normal or Wait block
        let blockEntryNodeId = prevNodeId;

        if (perceptionSpan) {
          nList.push({
            id: perceptionSpan.id,
            type: "agentNode",
            position: { x: 350, y: currentY },
            data: {
              label: "Perception",
              span: perceptionSpan,
              isSelected: selectedSpanId === perceptionSpan.id,
              onClick: () => selectSpan(perceptionSpan.id),
            },
          });
          eList.push({
            id: `e_${prevNodeId}_${perceptionSpan.id}`,
            source: prevNodeId,
            target: perceptionSpan.id,
          });
          blockEntryNodeId = perceptionSpan.id;
          currentY += 100;
        }

        // Parallel NPC branches
        if (npcSpans.length > 0) {
          const npcCount = npcSpans.length;
          const spacing = 190;
          const startX = 350 - ((npcCount - 1) * spacing) / 2;

          npcSpans.forEach((npcSpan, i) => {
            const npcId =
              (npcSpan.inputContext as any)?.npc?.id ||
              (npcSpan.inputContext as any)?.npc?.name ||
              `NPC ${i + 1}`;
            const posX = startX + i * spacing;

            nList.push({
              id: npcSpan.id,
              type: "agentNode",
              position: { x: posX, y: currentY },
              data: {
                label: `NPC: ${npcId}`,
                span: npcSpan,
                isSelected: selectedSpanId === npcSpan.id,
                onClick: () => selectSpan(npcSpan.id),
              },
            });

            eList.push({
              id: `e_${blockEntryNodeId}_${npcSpan.id}`,
              source: blockEntryNodeId,
              target: npcSpan.id,
              animated: npcSpan.status === "running",
            });
          });

          currentY += 100;
        }

        if (resolverSpan) {
          nList.push({
            id: resolverSpan.id,
            type: "agentNode",
            position: { x: 350, y: currentY },
            data: {
              label: "World Resolver",
              span: resolverSpan,
              isSelected: selectedSpanId === resolverSpan.id,
              onClick: () => selectSpan(resolverSpan.id),
            },
          });

          if (npcSpans.length > 0) {
            npcSpans.forEach((npcSpan) => {
              eList.push({
                id: `e_${npcSpan.id}_${resolverSpan.id}`,
                source: npcSpan.id,
                target: resolverSpan.id,
              });
            });
          } else {
            eList.push({
              id: `e_${blockEntryNodeId}_${resolverSpan.id}`,
              source: blockEntryNodeId,
              target: resolverSpan.id,
            });
          }

          prevNodeId = resolverSpan.id;
          currentY += 100;
        }
      }
    }

    // 3. Narrator
    const narrator = spans.find((s) => s.agentId === "narrator");
    if (narrator) {
      nList.push({
        id: narrator.id,
        type: "agentNode",
        position: { x: 350, y: currentY },
        data: {
          label: "Narrator",
          span: narrator,
          isSelected: selectedSpanId === narrator.id,
          onClick: () => selectSpan(narrator.id),
        },
      });
      eList.push({
        id: `e_${prevNodeId}_${narrator.id}`,
        source: prevNodeId,
        target: narrator.id,
      });
    }

    return { nodes: nList, edges: eList };
  }, [currentTrace, selectedSpanId]);

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
          </div>
        )}
      </div>

      {/* Main Debug Workspace */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Left: React Flow Graph or Timeline View */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative">
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
                {currentTrace?.spans.map((span) => {
                  const traceStart = currentTrace.startedAt;
                  const totalSpanDuration = Math.max(currentTrace.durationMs || 100, 100);
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
                        <span className="text-slate-800">{span.name}</span>
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
          <div className="w-96 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-right-10 duration-150">
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
                提示词
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
                      解析后的 Messages (已注入变量):
                    </span>
                    <JsonViewer data={selectedSpan.resolvedMessages} />
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
                <JsonViewer data={selectedSpan.parsedOutput} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
