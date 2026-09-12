import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "../components/Layout/Layout";
import { HomePage } from "../pages/Home/HomePage";
import { PlayPage } from "../pages/Play/PlayPage";
import { CharactersPage } from "../pages/Characters/CharactersPage";
import { WorldPage } from "../pages/World/WorldPage";
import { HistoryPage } from "../pages/History/HistoryPage";
import { BackendsPage } from "../pages/Backends/BackendsPage";
import { AgentsPage } from "../pages/Agents/AgentsPage";
import { AgentEditorPage } from "../pages/Agents/AgentEditorPage";
import { AgentGroupsPage } from "../pages/AgentGroups/AgentGroupsPage";
import { DebugPage } from "../pages/Debug/DebugPage";
import { StateInspectorPage } from "../pages/StateInspector/StateInspectorPage";
import { SettingsPage } from "../pages/Settings/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "play", element: <PlayPage /> },
      { path: "characters", element: <CharactersPage /> },
      { path: "world", element: <WorldPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "backends", element: <BackendsPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "agents/:id", element: <AgentEditorPage /> },
      { path: "agent-groups", element: <AgentGroupsPage /> },
      { path: "debug", element: <DebugPage /> },
      { path: "inspector", element: <StateInspectorPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
