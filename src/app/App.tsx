import { useRepositoryStore } from '../stores/useRepositoryStore';
import { loadPreferences } from '../db/preferences';
import React, { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { storageService } from "../db/storage";
import { useGameStore } from "../stores/useGameStore";
import { useBackendStore } from "../stores/useBackendStore";
import { useAgentStore } from "../stores/useAgentStore";
import { useAgentGroupStore } from "../stores/useAgentGroupStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useTraceStore } from "../stores/useTraceStore";
import { useLibraryStore } from '../stores/useLibraryStore';
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

export const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const { loadSaves } = useGameStore();
  const { loadBackends } = useBackendStore();
  const { loadAgents } = useAgentStore();
  const { loadGroups } = useAgentGroupStore();
  const { loadSettings } = useSettingsStore();
  const { loadTraces } = useTraceStore();

  const runInit = async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      await storageService.initDatabase();
      await loadPreferences();
      await Promise.all([
        loadSettings(),
        loadBackends(),
        loadAgents(),
        loadGroups(),
        loadSaves(),
        useLibraryStore.getState().load(),
      ]);
      await loadTraces();
      if (import.meta.env.DEV && !storageService.isTauri()) await useRepositoryStore.getState().load().catch(() => {});
      if (storageService.isTauri()) {
        const { initializeTestControl } = await import("./testControl");
        await initializeTestControl();
      }
    } catch (err: any) {
      console.error("Failed to initialize Story Tavern application:", err);
      setInitError(err?.message || String(err));
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    runInit();
  }, []);

  if (isInitializing) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 space-y-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30">
          AI
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
          <span>正在载入游戏引擎与数据库环境……</span>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">系统初始化失败</h2>
            <p className="text-xs text-slate-500 mt-1">
              引擎在加载持久化数据库或核心配置时遇到错误。系统已停止运行以防止数据损坏。
            </p>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg text-left text-xs font-mono text-rose-700 break-all border border-slate-200">
            {initError}
          </div>
          <button
            onClick={() => runInit()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试初始化</span>
          </button>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
};
