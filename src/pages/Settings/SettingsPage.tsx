import React from "react";
import { Settings as SettingsIcon, Sparkles, Code2, Database, Shield, Globe, Sun } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, setMockMode, setDeveloperMode, dataDirectory } =
    useSettingsStore();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-blue-600" />
          <span>系统设置 (Settings)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          配置引擎运行模式、数据存储、调试开发者功能与外观偏好。
        </p>
      </div>

      {/* Settings Form Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {/* Mock LLM Mode */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1 pr-6">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900">
                Mock LLM Mode (确定性模拟模式)
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                免配置
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              开启后，所有 Agent 不调用远程 LLM API，而是返回确定性的演示数据。可在完全无需 API Key 的情况下体验完整的时序管道与 Trace 调试器。
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.mockLlmMode}
              onChange={(e) => setMockMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Developer Mode */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1 pr-6">
            <span className="font-semibold text-sm text-slate-900 block">
              开发者模式 (Developer Mode)
            </span>
            <p className="text-xs text-slate-500 leading-relaxed">
              在界面顶部和左侧导航栏突出展示 Agent Graph、时序 Gantt 图、原始 Token 消耗及状态 Diff 检查器。
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.developerMode}
              onChange={(e) => setDeveloperMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Autosave */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1 pr-6">
            <span className="font-semibold text-sm text-slate-900 block">
              自动存档 (Autosave)
            </span>
            <p className="text-xs text-slate-500 leading-relaxed">
              每轮推演结算完成后自动持久化保存至本地 SQLite 数据库中。
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.autosave}
              onChange={(e) => updateSettings({ autosave: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Language */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-sm text-slate-900 block">
              界面语言 (Language)
            </span>
            <p className="text-xs text-slate-500">当前仅支持简体中文，英文界面尚未实现。</p>
          </div>

          <select
            value="zh-CN"
            disabled
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none font-medium text-slate-700"
          >
            <option value="zh-CN">中文 (简体)</option>
            <option value="en-US">English</option>
          </select>
        </div>

        {/* Theme */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-sm text-slate-900 block">
              主题外观 (Theme)
            </span>
            <p className="text-xs text-slate-500">当前仅支持浅色主题，跟随系统尚未实现。</p>
          </div>

          <select
            value="light"
            disabled
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none font-medium text-slate-700"
          >
            <option value="light">浅色 (Light)</option>
            <option value="system">跟随系统 (System)</option>
          </select>
        </div>

        {/* Log Level */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-sm text-slate-900 block">
              日志级别 (Log Level)
            </span>
            <p className="text-xs text-slate-500">日志级别过滤尚未实现，此设置暂不可用。</p>
          </div>

          <select
            value={settings.logLevel}
            disabled
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none font-medium text-slate-700"
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>

        {/* Data Directory */}
        <div className="p-6 flex items-center justify-between">
          <div className="space-y-1 pr-6">
            <span className="font-semibold text-sm text-slate-900 block">
              数据目录 (SQLite 存储路径)
            </span>
            <p className="text-xs font-mono text-slate-500 break-all">
              {dataDirectory}
            </p>
          </div>

          <button
            onClick={() => alert(`当前 SQLite 数据库文件已持久化保存在:\n${dataDirectory}`)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium shrink-0 transition-colors"
          >
            查看信息
          </button>
        </div>
      </div>
    </div>
  );
};
