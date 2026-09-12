import React from "react";
import { useNavigate } from "react-router-dom";
import { Play, Settings, Plus, FolderOpen, Clock, Sparkles, Bot, Trash2 } from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { activeSave, saves, selectSave, createNewSave, deleteSave } = useGameStore();
  const { settings, setMockMode } = useSettingsStore();

  const hasExistingSave = Boolean(activeSave && activeSave.turns && activeSave.turns.length > 0);

  const handleContinue = () => {
    navigate("/play");
  };

  const handleNewGame = async () => {
    await createNewSave("王城的黄昏 · 港口酒馆");
    navigate("/play");
  };

  const handleDeleteSave = async (e: React.MouseEvent, saveId: string) => {
    e.stopPropagation();
    if (window.confirm("确定要删除该存档吗？此操作无法撤销。")) {
      await deleteSave(saveId);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-10">
      {/* Hero Welcome Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm text-center space-y-6 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI 原生纯文字角色扮演游戏引擎</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          欢迎使用 AI Game Engine
        </h1>
        <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
          用 AI 驱动的动态世界，创造属于你的故事。玩家输入将被自动拆解为时序事件，由各 NPC 有限视角推演，经 World Resolver 统一结算并生成身临其境的旁白。
        </p>

        {/* Engine Mode Toggle */}
        <div className="flex flex-col items-center justify-center gap-2 pt-1">
          <div className="text-xs font-medium text-slate-400">推演引擎模式</div>
          <div className="inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs">
            <button
              onClick={() => setMockMode(true)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                settings.mockLlmMode
                  ? "bg-white text-amber-800 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Mock 模拟 (免配置)</span>
            </button>
            <button
              onClick={() => setMockMode(false)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                !settings.mockLlmMode
                  ? "bg-white text-blue-700 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-blue-600" />
              <span>真实 AI (调用大模型)</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-400 max-w-md">
            {settings.mockLlmMode
              ? "⚡ 当前为 Mock 确定性模式，无需配置 API Key 即可体验完整剧情时序与调试器。"
              : "🤖 当前为真实 AI 模式，将调用您配置的 OpenAI-compatible 后端执行实时推理。"}
          </p>
        </div>

        {/* Primary Actions */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          {hasExistingSave && (
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>继续游戏</span>
            </button>
          )}

          <button
            onClick={handleNewGame}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
              hasExistingSave
                ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shadow-sm"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"
            }`}
            title="开启一局全新剧情与对话"
          >
            <Plus className="w-4 h-4" />
            <span>新建游戏</span>
          </button>

          <button
            onClick={() => navigate("/backends")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-all"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>AI 配置</span>
          </button>
        </div>
      </div>

      {/* Recent Saves List */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-600" />
            <span>最近的存档</span>
          </h2>
          <span className="text-xs text-slate-400">共 {saves.length} 个存档</span>
        </div>

        {saves.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            暂无存档，点击上方“新建游戏”即可开始冒险。
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {saves.map((save) => {
              const isSelected = activeSave?.id === save.id;
              const lastTurn = save.turns[save.turns.length - 1];

              return (
                <div
                  key={save.id}
                  onClick={() => selectSave(save.id)}
                  className={`py-3.5 px-3 flex items-center justify-between rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50/70 border border-blue-200/80 -mx-1"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-800">
                        {save.name}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          当前活跃
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1 max-w-xl">
                      {lastTurn?.narratorOutput || "刚创建的冒险存档"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1 mr-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {new Date(save.updatedAt).toLocaleDateString("zh-CN")}{" "}
                        {new Date(save.updatedAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        selectSave(save.id);
                        navigate("/play");
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-blue-600 hover:text-white border border-slate-200 hover:border-blue-600 rounded-md text-slate-700 text-xs font-medium transition-all shadow-sm"
                    >
                      载入
                    </button>

                    <button
                      onClick={(e) => handleDeleteSave(e, save.id)}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                      title="删除存档"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
