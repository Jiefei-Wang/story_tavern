import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Send,
  Sparkles,
  Users,
  Compass,
  Clock,
  Settings,
  MessageSquare,
  Zap,
  FastForward,
  ShieldAlert,
  Loader2,
  ExternalLink,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Copy,
  Check,
  MoreHorizontal,
  Square,
} from "lucide-react";
import { GameTurn } from "../../types";
import { useGameStore } from "../../stores/useGameStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useTraceStore } from "../../stores/useTraceStore";
import { visibleNarration } from '../../engine/text/History';
import { SpatialEngine } from "../../engine/world/SpatialEngine";
import { GenerationPanel } from "./GenerationPanel";
import { GenerationTaskModal } from "./GenerationTaskModal";

export const PlayPage: React.FC = () => {
  const {
    activeSave,
    isExecuting,
    executionError,
    sendPlayerInput,
    currentTraceId,
    retryTurn,
    switchTurnVariation,
    cancelGeneration,
  } = useGameStore();
  const { settings } = useSettingsStore();
  const [inputText, setInputText] = useState("");
  const [isTimeMenuOpen, setIsTimeMenuOpen] = useState(false);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storyEndRef = useRef<HTMLDivElement>(null);
  const [copiedTurnIdx, setCopiedTurnIdx] = useState<number | null>(null);
  const [activeMenuTurnIdx, setActiveMenuTurnIdx] = useState<number | null>(null);
  const [selectedModalTurn, setSelectedModalTurn] = useState<GameTurn | null>(null);

  const handleCopyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(visibleNarration(text));
      setCopiedTurnIdx(idx);
      setTimeout(() => setCopiedTurnIdx(null), 1800);
    } catch {
      window.alert("复制失败，请检查剪贴板权限或手动选择旁白复制。");
    }
  };


  const textWorld = activeSave?.textWorld;
  const traces = useTraceStore(s => s.traces);
  const trace = traces.find(t => t.id === currentTraceId);
  const draft = [...(trace?.spans || [])].reverse().find(s => ['text_narrator', 'text_storyteller'].includes(s.agentId || ''))?.liveContent;
  const worldState = textWorld ? undefined : activeSave?.worldState;
  const turns = activeSave?.turns || [];

  // Auto scroll to bottom of story on new turn
  useEffect(() => {
    storyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, isExecuting]);

  // Close time menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeMenuRef.current && !timeMenuRef.current.contains(event.target as Node)) {
        setIsTimeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close turn action menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeMenuTurnIdx !== null) {
        const target = event.target as HTMLElement;
        if (!target.closest("[data-turn-menu]")) {
          setActiveMenuTurnIdx(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeMenuTurnIdx]);

  const handleStopGeneration = () => {
    const restored = cancelGeneration();
    if (restored) {
      setInputText(restored);
    }
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
    }, 0);
  };

  // Allow Escape key to stop generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExecuting) {
        e.preventDefault();
        handleStopGeneration();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExecuting]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isExecuting || (textWorld && settings.mockLlmMode)) return;

    const finalPrompt = inputText.trim();
    setInputText("");
    if (!await sendPlayerInput(finalPrompt)) setInputText(current => current || finalPrompt);
  };

  const insertQuickCommand = (keyword: string) => {
    setInputText((prev) => {
      if (!prev.trim()) return keyword;
      const separator = prev.endsWith("\n\n") ? "" : prev.endsWith("\n") ? "\n" : "\n\n";
      return prev + separator + keyword;
    });

    setIsTimeMenuOpen(false);
    setTimeout(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }, 30);
  };

  return (
    <div className="flex h-full gap-5 overflow-hidden">
      {/* Left: Main Story Area & Input */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="h-12 border-b border-slate-200 px-5 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm text-slate-800">
              {textWorld ? activeSave?.name : worldState?.scene?.location === "harbor_tavern"
                ? "王城的黄昏 · 港口酒馆"
                : worldState?.scene?.location || "冒险舞台"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {currentTraceId && (
              <Link
                to="/debug"
                onClick={() => useTraceStore.getState().selectTrace(currentTraceId)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md transition-colors"
                title="查看上一步 Agent Graph 与 Trace"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>查看 Trace</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            <Link
              to="/"
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-md transition-colors shadow-sm"
              title="返回首页选择并开始故事"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>开始其他故事</span>
            </Link>

            <Link
              to="/settings"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Story Narration Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 select-text">
          {turns.map((turn, idx) => (
            <div key={turn.id || idx} className="space-y-4 max-w-3xl mx-auto">
              {/* Turn divider or Player action */}
              {turn.playerInput &&
                turn.playerInput !== "(游戏开始)" &&
                turn.playerInput !== "(新游戏开始)" && (
                  <div className="flex items-center justify-between pl-2 border-l-2 border-blue-500/80 bg-blue-50/40 py-2 px-3 rounded-r-lg group">
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        P
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-medium text-blue-600">{turn.textTurn?.correctionOf ? "纠正上一轮" : textWorld ? "你的输入" : "你的行动"}</span>
                        <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {turn.playerInput}
                        </p>
                        {turn.textTurn?.correctionOf && <p className="text-xs text-slate-500">重新理解为：{turn.textTurn.effectiveInput}</p>}
                      </div>
                    </div>

                    {/* Branching Navigator & Retry Button */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!textWorld && turn.variations && turn.variations.length > 1 && (
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-xs text-slate-600 shadow-sm">
                          <button
                            type="button"
                            disabled={(turn.activeVariationIndex ?? 0) <= 0 || isExecuting}
                            onClick={() =>
                              switchTurnVariation(idx, (turn.activeVariationIndex ?? 0) - 1)
                            }
                            className="p-0.5 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors"
                            title="查看上一个分支"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[11px] font-mono px-1">
                            {(turn.activeVariationIndex ?? 0) + 1} / {turn.variations.length}
                          </span>
                          <button
                            type="button"
                            disabled={
                              (turn.activeVariationIndex ?? 0) >= turn.variations.length - 1 ||
                              isExecuting
                            }
                            onClick={() =>
                              switchTurnVariation(idx, (turn.activeVariationIndex ?? 0) + 1)
                            }
                            className="p-0.5 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors"
                            title="查看下一个分支"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {!textWorld && <button
                        type="button"
                        disabled={isExecuting}
                        onClick={() => retryTurn(idx)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 px-2 py-0.5 rounded-md transition-colors shadow-sm disabled:opacity-40"
                        title="重试当前命令（生成新分支）"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>重试</span>
                      </button>}
                    </div>
                  </div>
                )}

              {/* Literary Prose Narration */}
              <div className="relative group/narration select-text">
                <div
                  className={`flex items-center justify-end gap-1.5 mb-1 transition-opacity ${
                    activeMenuTurnIdx === idx ? "opacity-100" : "opacity-0 group-hover/narration:opacity-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleCopyText(turn.narratorOutput, idx)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded transition-all cursor-pointer"
                    title="复制本段旁白内容"
                  >
                    {copiedTurnIdx === idx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-600 font-medium">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制旁白</span>
                      </>
                    )}
                  </button>

                  {/* Three-dots menu button */}
                  <div className="relative" data-turn-menu>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuTurnIdx(activeMenuTurnIdx === idx ? null : idx);
                      }}
                      className={`p-1 rounded border transition-colors cursor-pointer flex items-center justify-center ${
                        activeMenuTurnIdx === idx
                          ? "bg-blue-50 text-blue-600 border-blue-200"
                          : "text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200/80"
                      }`}
                      title="更多选项"
                      aria-label="回合操作菜单"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>

                    {activeMenuTurnIdx === idx && (
                      <div
                        className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-30 text-xs animate-in fade-in duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuTurnIdx(null);
                            setSelectedModalTurn(turn);
                          }}
                          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 text-slate-700 transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-medium">查看生成任务</span>
                        </button>

                        {turn.traceId && turn.traceId !== "trace_init" && (
                          <Link
                            to="/debug"
                            onClick={() => {
                              setActiveMenuTurnIdx(null);
                              useTraceStore.getState().selectTrace(turn.traceId);
                            }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 text-slate-700 transition-colors border-t border-slate-100 mt-1 pt-1.5 cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>在调试台查看 Trace</span>
                            <ExternalLink className="w-3 h-3 text-slate-400 ml-auto" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {turn.textTurn?.supersededBy && <p className="text-xs text-amber-700">本轮已被后续纠正。以下是保留的旧记录，其剧情后果已撤回。</p>}
                <div className="prose prose-slate max-w-none text-slate-700 text-sm leading-7 space-y-3 font-normal select-text">
                  {visibleNarration(turn.narratorOutput)
                    .split("\n\n")
                    .filter(Boolean)
                    .map((paragraph, pIdx) => {
                      // Highlight dialogue in quotation blocks
                      const isDialog = paragraph.includes("“") && paragraph.includes("”");
                      return (
                        <p
                          key={pIdx}
                          className={
                            isDialog
                              ? "bg-slate-50/80 border-l-2 border-slate-300 pl-3 py-1 text-slate-800 italic select-text"
                              : "select-text"
                          }
                        >
                          {paragraph}
                        </p>
                      );
                    })}
                </div>
              </div>

              {turn.textTurn && <p className="text-[11px] text-slate-400 text-right">{turn.textTurn.commit === 'saved' ? '已保存' : '草稿，尚未提交'}</p>}
              {idx < turns.length - 1 && <div className="h-px bg-slate-100 my-6" />}
            </div>
          ))}

          {textWorld && isExecuting && <div className="max-w-3xl mx-auto space-y-3"><p className="text-xs text-blue-600 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>正在生成草稿，尚未提交保存</p>{draft && <p className="text-sm text-slate-700 leading-7 whitespace-pre-wrap">{visibleNarration(draft || '')}</p>}</div>}
          {/* Running indicator */}
          <GenerationPanel traceId={currentTraceId} running={isExecuting} onStop={handleStopGeneration} />

          {/* Execution error alert with retry button */}
          {executionError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                <span>推演失败: {executionError}</span>
              </div>
              <button
                type="button"
                onClick={() => textWorld ? handleSend() : retryTurn()}
                disabled={isExecuting}
                className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded font-medium flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
                title="重新尝试上一次的推演"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{textWorld ? '重新发送输入' : '重试当前命令'}</span>
              </button>
            </div>
          )}

          <div ref={storyEndRef} />
        </div>

        {/* Input Bar & Quick Commands */}
        <div className="border-t border-slate-200 p-4 bg-white space-y-3 shrink-0">
          {/* Quick Commands Toolbar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[11px] text-slate-400 font-medium">快捷命令:</span>

            <button
              type="button"
              onClick={() => insertQuickCommand("动作：")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              title="在对话框追加动作关键词（自动智能换行）"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>动作</span>
            </button>

            <button
              type="button"
              onClick={() => insertQuickCommand("对白：")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              title="在对话框追加对白关键词（自动智能换行）"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
              <span>对白</span>
            </button>

            <button
              type="button"
              onClick={() => insertQuickCommand(textWorld ? "场景调整：" : "admin:")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              title={textWorld ? "输入场景调整或纠正要求" : "在对话框追加管理员法则/环境修改指令"}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>{textWorld ? "场景" : "管理员"}</span>
            </button>

            {/* Fast Forward Dropdown Menu */}
            {!textWorld && <div className="relative" ref={timeMenuRef}>
              <button
                type="button"
                onClick={() => setIsTimeMenuOpen(!isTimeMenuOpen)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                  isTimeMenuOpen
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
                title="选择或自定义快进时间"
              >
                <FastForward className="w-3.5 h-3.5 text-indigo-500" />
                <span>快进</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isTimeMenuOpen && (
                <div className="absolute left-0 bottom-full mb-1.5 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-xs text-slate-700">
                  {["10分钟", "半小时", "1小时", "1天", "一周"].map(time => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => insertQuickCommand(`快进：${time}`)}
                      className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      {time}
                    </button>
                  ))}
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => insertQuickCommand("快进：")}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors text-slate-500 italic"
                  >
                    手动输入...
                  </button>
                </div>
              )}
            </div>}
            {textWorld && <button type="button" onClick={() => insertQuickCommand("呈现要求：")} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"><Sparkles className="w-3.5 h-3.5 text-indigo-500"/>文风</button>}
          </div>
          {textWorld && settings.mockLlmMode && <p className="text-xs text-amber-700">文本故事需要真实 Backend。<button type="button" className="underline ml-1" onClick={() => useSettingsStore.getState().setMockMode(false)}>切换到已配置的真实模型</button></p>}

          {/* Form */}
          <form onSubmit={handleSend} className="relative flex items-center">
            <textarea
              aria-label="你的言行"
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={textWorld ? "输入动作、对白、纠正或场景要求……（Enter 发送，Shift+Enter 换行）" : "输入你的动作、对白、快进或管理员命令……（Enter 发送，Shift+Enter 换行）"}
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-20 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
              disabled={isExecuting}
            />

            {isExecuting ? (
              <button
                key="stop-generation"
                type="button"
                onClick={(event) => { event.preventDefault(); handleStopGeneration(); }}
                className="absolute right-2.5 bottom-2.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-rose-500/20 transition-all cursor-pointer"
                title="暂停生成并恢复输入内容（快捷键：Escape）"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>暂停生成</span>
              </button>
            ) : (
              <button
                key="send-input"
                type="submit"
                disabled={!inputText.trim() || !!textWorld && settings.mockLlmMode}
                className="absolute right-2.5 bottom-2.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>发送</span>
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Right: Scene, Characters & World Status */}
      <div className="w-80 flex flex-col gap-4 overflow-y-auto shrink-0 select-none">
        {textWorld ? <>
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500"><span className="flex items-center gap-1.5 font-medium text-slate-700"><Clock className="w-3.5 h-3.5 text-blue-600"/>故事进度</span><span className="font-mono">已保存版本 {textWorld.revision}</span></div>
            <p className="text-[11px] text-slate-500">{isExecuting ? '本轮生成中，完成后整体保存' : '正文与世界文档已同步保存'}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700"><Compass className="w-3.5 h-3.5 text-blue-600"/>当前故事</div>
            <p className="text-sm font-semibold text-slate-800">{activeSave?.storyInfo?.title || '故事场景'}</p><Link to="/save-world" className="text-xs text-blue-600 hover:underline">本局世界设定</Link>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm flex-1">
            <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-medium text-slate-700"><Users className="w-3.5 h-3.5 text-blue-600"/>故事人物</span><Link to="/save-characters" className="text-blue-600 hover:underline text-[11px]">查看详情</Link></div>
            <div className="space-y-2.5">{textWorld.characters.map(id => <Link to={`/save-characters?character=${encodeURIComponent(id)}`} aria-label={`查看人物：${textWorld.documents[`characters/${id}/public.md`]?.text.split("\n")[0].replace(/^#+\s*/, "") || id}`} key={id} className="block p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5 hover:border-blue-300 hover:bg-blue-50 transition-colors"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-800">{textWorld.documents[`characters/${id}/public.md`]?.text.split('\n')[0].replace(/^#+\s*/, '') || id}</span><span className="text-xs text-slate-500">{id === textWorld.playerId ? '玩家' : '人物'}</span></div></Link>)}</div>
          </div>
        </> : <>
        {/* World Time Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              世界时钟
            </span>
            <span className="font-mono text-slate-600">
              {worldState?.clock || "1342-06-12 08:16:00"}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              光照: {worldState?.scene?.lighting || "morning"}
            </span>
            <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              天气: {worldState?.scene?.weather || "clear"}
            </span>
          </div>
        </div>

        {/* Current Scene Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            <span>当前场景</span>
          </div>
          <div className="text-sm font-semibold text-slate-800">
            {worldState?.scene?.location === "harbor_tavern"
              ? "城镇 · 港口酒馆外"
              : worldState?.scene?.location}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {worldState?.scene?.description}
          </p>
        </div>

        {/* Characters in Scene */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              在场角色
            </span>
            <Link to="/save-characters" className="text-blue-600 hover:underline text-[11px]">
              查看详情
            </Link>
          </div>

          <div className="space-y-2.5">
            {worldState?.entities &&
              Object.entries(worldState.entities)
                .filter(([id, ent]) => ent.type === "character" && SpatialEngine.isEntityInScene(id, ent, worldState))
                .map(([id, char]) => {
                  const isPlayer = id === "player";


                  return (
                    <div
                      key={id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5 hover:border-slate-200 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">
                          {char.name || id}
                        </span>
                        <span className="text-xs text-slate-500">{isPlayer ? "玩家" : "人物"}</span>
                      </div>


                    </div>
                  );
                })}
          </div>
        </div>
        </>}
      </div>

      {/* Generation Task Details Modal */}
      {selectedModalTurn && (
        <GenerationTaskModal
          turn={selectedModalTurn}
          onClose={() => setSelectedModalTurn(null)}
        />
      )}
    </div>
  );
};
