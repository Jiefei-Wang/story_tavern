import React, { useState } from "react";
import { Activity, History, GitCommit, ArrowRight, Check } from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { JsonViewer } from "../../components/Common/JsonViewer";

export const StateInspectorPage: React.FC = () => {
  const { activeSave } = useGameStore();
  const [activeView, setActiveView] = useState<"current" | "diff" | "history">("diff");

  const worldState = activeSave?.worldState;
  const turns = activeSave?.turns || [];
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <span>State Inspector (世界状态与补丁检查器)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            检查当前世界快照、最近一次 RFC 6902 JSON Patch 的状态增量，以及全生命周期补丁历史。
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm text-xs">
          <button
            onClick={() => setActiveView("diff")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeView === "diff"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            最近变更 (Last Patch Diff)
          </button>
          <button
            onClick={() => setActiveView("current")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeView === "current"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            当前完整世界 (Current State)
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeView === "history"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Patch 历史流
          </button>
        </div>
      </div>

      {/* View 1: Diff View (Last Patch) */}
      {activeView === "diff" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-sm text-slate-800">
                  最近一轮行动生成的 RFC 6902 Patches (Turn #{latestTurn?.turnIndex ?? 0})
                </span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {latestTurn?.patches.length || 0} 个变更操作
              </span>
            </div>

            {/* List of patch diff operations */}
            {(!latestTurn?.patches || latestTurn.patches.length === 0) ? (
              <div className="text-xs text-slate-400 py-6 text-center">
                上一轮无物理或心智状态变更。
              </div>
            ) : (
              <div className="space-y-2">
                {latestTurn.patches.map((patch, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="uppercase font-bold text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {patch.op}
                      </span>
                      <span className="text-slate-700 font-semibold">{patch.path}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {typeof patch.value === "object"
                          ? JSON.stringify(patch.value)
                          : String(patch.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Before and After Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <span className="font-bold text-xs text-slate-700 block">
                变更前状态 (State Before)
              </span>
              <JsonViewer data={latestTurn?.worldStateBefore || worldState} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <span className="font-bold text-xs text-slate-700 block">
                变更后状态 (State After)
              </span>
              <JsonViewer data={latestTurn?.worldStateAfter || worldState} />
            </div>
          </div>
        </div>
      )}

      {/* View 2: Current State */}
      {activeView === "current" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold text-sm text-slate-800">
              当前全局世界状态快照 (WorldState)
            </span>
            <span className="font-mono">Clock: {worldState?.clock}</span>
          </div>
          <JsonViewer data={worldState} />
        </div>
      )}

      {/* View 3: Full Patch History */}
      {activeView === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <span className="font-bold text-sm text-slate-800 block">
            全生命周期 Patch 历史记录
          </span>

          <div className="space-y-4">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    Turn #{turn.turnIndex}: {turn.playerInput}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {new Date(turn.timestamp).toLocaleTimeString("zh-CN")}
                  </span>
                </div>

                {turn.patches.length > 0 ? (
                  <div className="space-y-1 pt-1 font-mono text-[11px]">
                    {turn.patches.map((p, pIdx) => (
                      <div
                        key={pIdx}
                        className="flex items-center gap-2 text-slate-600 bg-white p-1.5 rounded border border-slate-200"
                      >
                        <span className="text-blue-600 uppercase font-bold text-[10px]">
                          {p.op}
                        </span>
                        <span className="font-semibold">{p.path}</span>
                        <span>➔</span>
                        <span className="text-emerald-700">
                          {typeof p.value === "object"
                            ? JSON.stringify(p.value)
                            : String(p.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 italic">该回合无状态变更。</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
