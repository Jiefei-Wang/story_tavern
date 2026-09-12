import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  Gamepad2,
  Users,
  Globe2,
  History,
  Server,
  Bot,
  Layers,
  GitFork,
  Activity,
  Settings,
} from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const Sidebar: React.FC = () => {
  const { settings } = useSettingsStore();

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
      isActive
        ? "bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10 font-semibold"
        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
    }`;

  return (
    <aside className="w-56 bg-slate-50/70 border-r border-slate-200 flex flex-col justify-between select-none shrink-0 h-full">
      <div className="p-3 space-y-6 overflow-y-auto">
        {/* Game section */}
        <div>
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
            游戏
          </div>
          <nav className="space-y-0.5">
            <NavLink to="/" end className={navItemClass}>
              <Home className="w-4 h-4 text-slate-500" />
              <span>首页</span>
            </NavLink>
            <NavLink to="/play" className={navItemClass}>
              <Gamepad2 className="w-4 h-4 text-blue-600" />
              <span>游戏</span>
            </NavLink>
            <NavLink to="/characters" className={navItemClass}>
              <Users className="w-4 h-4 text-slate-500" />
              <span>角色</span>
            </NavLink>
            <NavLink to="/world" className={navItemClass}>
              <Globe2 className="w-4 h-4 text-slate-500" />
              <span>世界</span>
            </NavLink>
            <NavLink to="/history" className={navItemClass}>
              <History className="w-4 h-4 text-slate-500" />
              <span>历史</span>
            </NavLink>
          </nav>
        </div>

        {/* AI Configuration section */}
        <div>
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
            AI 配置
          </div>
          <nav className="space-y-0.5">
            <NavLink to="/backends" className={navItemClass}>
              <Server className="w-4 h-4 text-slate-500" />
              <span>Backends</span>
            </NavLink>
            <NavLink to="/agents" className={navItemClass}>
              <Bot className="w-4 h-4 text-slate-500" />
              <span>Agents</span>
            </NavLink>
            <NavLink to="/agent-groups" className={navItemClass}>
              <Layers className="w-4 h-4 text-slate-500" />
              <span>Agent 组</span>
            </NavLink>
          </nav>
        </div>

        {/* Developer / Debugger section */}
        <div>
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 tracking-wider uppercase flex items-center justify-between">
            <span>开发者</span>
            {settings.developerMode && (
              <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.2 rounded font-mono">
                DEV
              </span>
            )}
          </div>
          <nav className="space-y-0.5">
            <NavLink to="/debug" className={navItemClass}>
              <GitFork className="w-4 h-4 text-slate-500" />
              <span>Agent Graph / Trace</span>
            </NavLink>
            <NavLink to="/inspector" className={navItemClass}>
              <Activity className="w-4 h-4 text-slate-500" />
              <span>State Inspector</span>
            </NavLink>
          </nav>
        </div>
      </div>

      {/* Bottom Settings Link */}
      <div className="p-3 border-t border-slate-200">
        <NavLink to="/settings" className={navItemClass}>
          <Settings className="w-4 h-4 text-slate-500" />
          <span>设置 (Settings)</span>
        </NavLink>
      </div>
    </aside>
  );
};
