import { LibraryPage } from '../pages/Library/LibraryPage';
import { SaveConfigurationPage } from '../pages/Library/SaveConfigurationPage';
import React from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { Layout } from "../components/Layout/Layout";
import { HomePage } from "../pages/Home/HomePage";
import { PlayPage } from "../pages/Play/PlayPage";
import { HistoryPage } from "../pages/History/HistoryPage";
import { BackendsPage } from "../pages/Backends/BackendsPage";
import { AgentsPage } from "../pages/Agents/AgentsPage";
import { AgentEditorPage } from "../pages/Agents/AgentEditorPage";
import { AgentGroupsPage } from "../pages/AgentGroups/AgentGroupsPage";
import { DebugPage } from "../pages/Debug/DebugPage";
import { SettingsPage } from "../pages/Settings/SettingsPage";
import {TextDocumentsPage} from '../pages/Text/TextPages';
import {useGameStore} from '../stores/useGameStore';
function StoryRoute({kind}:{kind:'play'|'inspector'}) {
  const location = useLocation();
  const save = useGameStore(s => s.activeSave);
  if (kind === 'play') return <PlayPage key={save?.id}/>;
  return save?.textWorld ? <TextDocumentsPage key={`${save.id}:${location.search}`} section="inspector"/> : <div className="library-page text-slate-500">请先开始故事或进入存档。</div>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "play", element: <StoryRoute kind="play" /> },
      { path: "characters", element: <LibraryPage kind="characters" /> },
      { path: "characters/:id", element: <LibraryPage kind="characters" /> },
      { path: "save-characters", element: <SaveConfigRoute kind="characters" /> },
      { path: "world", element: <LibraryPage kind="worlds" /> },
      { path: "world/:id", element: <LibraryPage kind="worlds" /> },
      { path: "stories", element: <LibraryPage kind="stories" /> },
      { path: "stories/:id", element: <LibraryPage kind="stories" /> },
      { path: "save-world", element: <SaveConfigRoute kind="world" /> },
      { path: "history", element: <HistoryPage /> },
      { path: "backends", element: <BackendsPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "agents/:id", element: <AgentEditorPage /> },
      { path: "agent-groups", element: <AgentGroupsPage /> },
      { path: "debug", element: <DebugPage /> },
      { path: "inspector", element: <StoryRoute kind="inspector" /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

function SaveConfigRoute({ kind }: { kind: 'characters' | 'world' }) {
  const location = useLocation(), save = useGameStore(s => s.activeSave);
  return <SaveConfigurationPage key={`${save?.id}:${kind}:${location.search}`} kind={kind}/>;
}
