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
import { Loader2 } from "lucide-react";

export const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const { loadSaves } = useGameStore();
  const { loadBackends } = useBackendStore();
  const { loadAgents } = useAgentStore();
  const { loadGroups } = useAgentGroupStore();
  const { loadSettings } = useSettingsStore();
  const { loadTraces } = useTraceStore();

  useEffect(() => {
    const init = async () => {
      try {
        await storageService.initDatabase();
        await Promise.all([
          loadSettings(),
          loadBackends(),
          loadAgents(),
          loadGroups(),
          loadSaves(),
        ]);
        loadTraces();
      } catch (err) {
        console.error("Failed to initialize Story Tavern application:", err);
      } finally {
        setIsInitializing(false);
      }
    };

    init();
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

  return <RouterProvider router={router} />;
};
