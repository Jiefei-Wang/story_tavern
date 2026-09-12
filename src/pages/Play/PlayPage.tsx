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
} from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { SpatialEngine } from "../../engine/world/SpatialEngine";

export const PlayPage: React.FC = () => {
  const {
    activeSave,
    isExecuting,
    executionError,
    sendPlayerInput,
    currentTraceId,
    retryTurn,
    switchTurnVariation,
    createNewSave,
  } = useGameStore();
  const { settings } = useSettingsStore();
  const [inputText, setInputText] = useState("");
  const [isTimeMenuOpen, setIsTimeMenuOpen] = useState(false);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storyEndRef = useRef<HTMLDivElement>(null);

  const handleNewGame = async () => {
    if (window.confirm("确定要开启一局新游戏吗？当前进度已保存在存档中。")) {
      await createNewSave("王城的黄昏 · 港口酒馆");
    }
  };

  const worldState = activeSave?.worldState;
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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isExecuting) return;

    const finalPrompt = inputText.trim();
    setInputText("");
    await sendPlayerInput(finalPrompt);
  };

  const insertQuickCommand = (keyword: string) => {
    setInputText((prev) => {
      let next = "";
      if (!prev || !prev.trim()) {
        next = keyword;
      } else if (prev.endsWith("\n\n")) {
        next = prev + keyword;
      } else if (prev.endsWith("\n")) {
        next = prev + "\n" + keyword;
      } else {
        next = prev + "\n\n" + keyword;
      }
      return next;
    });

    setIsTimeMenuOpen(false);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
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
              {worldState?.scene?.location === "harbor_tavern"
                ? "王城的黄昏 · 港口酒馆"
                : worldState?.scene?.location || "冒险舞台"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {currentTraceId && (
              <Link
                to="/debug"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md transition-colors"
                title="查看上一步 Agent Graph 与 Trace"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>查看 Trace</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            <button
              onClick={handleNewGame}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-md transition-colors shadow-sm"
              title="重新开启一局新游戏（新建存档）"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>新建游戏</span>
            </button>

            <Link
              to="/settings"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Story Narration Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                        <span className="text-[11px] font-medium text-blue-600">你的行动</span>
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">
                          {turn.playerInput}
                        </p>
                      </div>
                    </div>

                    {/* Branching Navigator & Retry Button */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {turn.variations && turn.variations.length > 1 && (
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

                      <button
                        type="button"
                        disabled={isExecuting}
                        onClick={() => retryTurn(idx)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 px-2 py-0.5 rounded-md transition-colors shadow-sm disabled:opacity-40"
                        title="重试当前命令（生成新分支）"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>重试</span>
                      </button>
                    </div>
                  </div>
                )}

              {/* Literary Prose Narration */}
              <div className="prose prose-slate max-w-none text-slate-700 text-sm leading-7 space-y-3 font-normal">
                {turn.narratorOutput
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
                            ? "bg-slate-50/80 border-l-2 border-slate-300 pl-3 py-1 text-slate-800 italic"
                            : ""
                        }
                      >
                        {paragraph}
                      </p>
                    );
                  })}
              </div>

              {idx < turns.length - 1 && <div className="h-px bg-slate-100 my-6" />}
            </div>
          ))}

          {/* Running indicator */}
          {isExecuting && (
            <div className="flex items-center gap-3 py-4 text-xs text-blue-600 bg-blue-50/50 p-4 rounded-xl border border-blue-100 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>
                {settings.mockLlmMode
                  ? "Mock 模拟管道推演中..."
                  : "Agent 多模型分布式推演中..."}{" "}
                (Input Compiler → Perception → NPC Reaction → World Resolver → Narrator)
              </span>
            </div>
          )}

          {/* Execution error alert with retry button */}
          {executionError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                <span>推演失败: {executionError}</span>
              </div>
              <button
                type="button"
                onClick={() => retryTurn()}
                disabled={isExecuting}
                className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded font-medium flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
                title="重新尝试上一次的推演"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重试当前命令</span>
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
              onClick={() => insertQuickCommand("admin:")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              title="在对话框追加管理员法则/环境修改指令（自动智能换行）"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>管理员</span>
            </button>

            {/* Fast Forward Dropdown Menu */}
            <div className="relative" ref={timeMenuRef}>
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
                  <button
                    type="button"
                    onClick={() => insertQuickCommand("快进：10分钟")}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    10分钟
                  </button>
                  <button
                    type="button"
                    onClick={() => insertQuickCommand("快进：半小时")}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    半小时
                  </button>
                  <button
                    type="button"
                    onClick={() => insertQuickCommand("快进：1小时")}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    1小时
                  </button>
                  <button
                    type="button"
                    onClick={() => insertQuickCommand("快进：1天")}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    1天
                  </button>
                  <button
                    type="button"
                    onClick={() => insertQuickCommand("快进：一周")}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    一周
                  </button>
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
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSend} className="relative flex items-center">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="输入你的动作、对白、快进或管理员命令……（Enter 发送，Shift+Enter 换行）"
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-20 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
              disabled={isExecuting}
            />

            <button
              type="submit"
              disabled={isExecuting || !inputText.trim()}
              className="absolute right-2.5 bottom-2.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all"
            >
              {isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>发送</span>
            </button>
          </form>
        </div>
      </div>

      {/* Right: Scene, Characters & World Status */}
      <div className="w-80 flex flex-col gap-4 overflow-y-auto shrink-0 select-none">
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
            <Link to="/characters" className="text-blue-600 hover:underline text-[11px]">
              查看详情
            </Link>
          </div>

          <div className="space-y-2.5">
            {worldState?.entities &&
              Object.entries(worldState.entities)
                .filter(([id, ent]) => ent.type === "character" && SpatialEngine.isEntityInScene(id, ent, worldState))
                .map(([id, char]) => {
                  const isPlayer = id === "player";
                  const mood = char.mentalState?.mood || "normal";

                  return (
                    <div
                      key={id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5 hover:border-slate-200 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">
                          {char.name || id}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            mood === "alert"
                              ? "bg-amber-100 text-amber-800"
                              : mood === "suspicious"
                              ? "bg-purple-100 text-purple-800"
                              : mood === "cheerful"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          情绪: {mood}
                        </span>
                      </div>

                      {char.goal && (
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          目标: {char.goal}
                        </p>
                      )}
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
};
