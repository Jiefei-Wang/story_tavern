import { stateDescription } from '../Text/stateDescription';
import { visibleNarration } from '../../engine/text/History';
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Zap, Clock, ChevronRight, Layers, ArrowRight } from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { useTraceStore } from "../../stores/useTraceStore";
import { GameTurn } from "../../types";
import { JsonViewer } from "../../components/Common/JsonViewer";

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeSave } = useGameStore();
  const { selectTrace } = useTraceStore();

  const turns = activeSave?.turns || [];
  const [selectedTurnId, setSelectedTurnId] = useState<string>(
    turns.length > 0 ? turns[turns.length - 1].id : ""
  );

  const selectedTurn = turns.find((t) => t.id === selectedTurnId) || turns[turns.length - 1];

  const handleOpenTrace = (traceId: string) => {
    selectTrace(traceId);
    navigate("/debug");
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Top Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <span>Turn 历史记录 (Game History)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            查看历次回合的玩家输入、故事正文、人物状态与生成记录。
          </p>
        </div>
      </div>

      {/* Main Content: Left Turn List, Right Turn Details */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Turn List */}
        <div className="w-80 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="h-11 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>回合列表 ({turns.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
            {turns.map((turn) => {
              const isSelected = selectedTurn?.id === turn.id;

              return (
                <div
                  key={turn.id}
                  onClick={() => setSelectedTurnId(turn.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50/80 border border-blue-200 text-blue-900 shadow-sm"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold">Turn #{turn.turnIndex}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(turn.timestamp).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>

                  <p className="text-xs line-clamp-1 text-slate-600">
                    {turn.playerInput}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Turn Details */}
        {selectedTurn && (
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 overflow-y-auto space-y-6">
            {/* Header & Open Trace Button */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <h2 className="font-bold text-base text-slate-900">
                  Turn #{selectedTurn.turnIndex} 详情
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>Trace ID: {selectedTurn.traceId}</span>
                  <span>Agent Group: {selectedTurn.activeAgentGroupId}</span>
                </div>
              </div>

              <button
                onClick={() => handleOpenTrace(selectedTurn.traceId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium shadow-sm transition-all flex items-center gap-2"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>在调试器中查看 Trace (Open Trace)</span>
              </button>
            </div>

            {/* Player Input Section */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">玩家输入指令:</span>
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-950 font-medium">
                {selectedTurn.playerInput}
              </div>
            </div>

            {/* Narrator Output Section */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">生成的旁白正文:</span>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                {visibleNarration(selectedTurn.narratorOutput)}
              </div>
            </div>

            {selectedTurn.textTurn?.pipeline === 'routed-v2' ? <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 block">人物回应与完毕状态:</span>
              {!selectedTurn.textTurn.designs?.length && <p className="text-xs text-slate-400">本轮没有人物状态更新。</p>}
              {selectedTurn.textTurn.designs?.map(design => <section key={design.character_id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <h3 className="font-semibold">{selectedTurn.textTurn!.after.documents[`characters/${design.character_id}/public.md`]?.text.split('\n')[0].replace(/^#+\s*/, '') || design.character_id}</h3>
                <p>表达概要：{design.expression_outline ?? design.expression ?? '无'}</p><p>动作：{design.action || '无'}</p>
                <p className="whitespace-pre-wrap text-slate-600">{stateDescription(design.end_state)}</p>
              </section>)}
            </div> : <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">
                产生的 RFC 6902 世界补丁 ({selectedTurn.patches.length}):
              </span>
              {selectedTurn.patches.length === 0 ? (
                <div className="text-xs text-slate-400 italic">该回合无补丁产生。</div>
              ) : (
                <div className="space-y-1.5 font-mono text-xs">
                  {selectedTurn.patches.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-lg"
                    >
                      <span className="uppercase text-blue-600 font-bold text-[10px]">
                        {p.op}
                      </span>
                      <span className="text-slate-800 font-semibold">{p.path}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-emerald-700">
                        {typeof p.value === "object"
                          ? JSON.stringify(p.value)
                          : String(p.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
};
