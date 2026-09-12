import React from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Server,
  Layers,
  Save,
  Code2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { useAgentGroupStore } from "../../stores/useAgentGroupStore";
import { useBackendStore } from "../../stores/useBackendStore";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const TopBar: React.FC = () => {
  const { activeSave } = useGameStore();
  const { groups, activeGroupId, setActiveGroup } = useAgentGroupStore();
  const { backends } = useBackendStore();
  const { settings, setDeveloperMode } = useSettingsStore();

  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0];

  // Check overall backend status
  const enabledBackends = backends.filter((b) => b.enabled);
  const onlineCount = enabledBackends.filter((b) => b.status === "online").length;
  const isOnline = onlineCount > 0;

  return (
    <header className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Active Save */}
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 font-bold text-sm">
            AI
          </div>
          <span className="font-semibold text-slate-800 text-sm tracking-tight group-hover:text-blue-600 transition-colors">
            AI Game Engine
          </span>
        </Link>

        <div className="h-4 w-px bg-slate-200" />

        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-md">
          <Save className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">当前存档:</span>
          <span className="font-medium text-slate-700 max-w-[160px] truncate">
            {activeSave?.name || "未选择存档"}
          </span>
        </div>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-3">
        {/* Mock mode indicator if active */}
        {settings.mockLlmMode && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200/80 text-amber-700 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mock 模拟模式</span>
          </div>
        )}

        {/* Current Agent Group Switcher */}
        <div className="relative flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-slate-400">Agent 组:</span>
          <select
            value={activeGroupId}
            onChange={(e) => setActiveGroup(e.target.value)}
            className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer pr-1"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Backend Status indicator */}
        <Link
          to="/backends"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors hover:bg-slate-50"
          style={{
            borderColor: isOnline ? "#bbf7d0" : "#fed7aa",
            backgroundColor: isOnline ? "#f0fdf4" : "#fff7ed",
          }}
          title="点击进入后端服务配置"
        >
          <Server className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500">后端:</span>
          <span
            className={`flex items-center gap-1 font-medium ${
              isOnline ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {isOnline ? `在线 (${onlineCount})` : "离线 / 未连接"}
          </span>
        </Link>

        {/* Developer Mode toggle button */}
        <button
          onClick={() => setDeveloperMode(!settings.developerMode)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all ${
            settings.developerMode
              ? "bg-blue-50 border-blue-200 text-blue-700 font-medium"
              : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700"
          }`}
          title="切换开发者模式"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>开发者模式</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              settings.developerMode ? "bg-blue-600" : "bg-slate-300"
            }`}
          />
        </button>
      </div>
    </header>
  );
};
