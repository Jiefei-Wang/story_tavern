import { create } from "zustand";
import { TraceSpan, TurnTrace } from "../types";
import { globalTraceManager } from "../engine/tracing/TraceManager";
import { storageService } from "../db/storage";

interface TraceState {
  traces: TurnTrace[];
  selectedTraceId: string | null;
  selectedSpanId: string | null;
  activeTab: "graph" | "timeline";
  loadTraces: () => Promise<void>;
  selectTrace: (traceId: string | null) => void;
  selectSpan: (spanId: string | null) => void;
  setActiveTab: (tab: "graph" | "timeline") => void;
  getSelectedTrace: () => TurnTrace | undefined;
  getSelectedSpan: () => TraceSpan | undefined;
}

export const useTraceStore = create<TraceState>((set, get) => ({
  traces: [],
  selectedTraceId: null,
  selectedSpanId: null,
  activeTab: "graph",

  loadTraces: async () => {
    try {
      const persisted = await storageService.getTraces(200);
      globalTraceManager.loadCompletedTraces(persisted);
    } catch (err) {
      console.warn("Failed to load persisted traces:", err);
    }

    const traces = globalTraceManager.getAllTraces();
    set({ traces });
  },

  selectTrace: (traceId: string | null) => {
    set({ selectedTraceId: traceId, selectedSpanId: null });
  },

  selectSpan: (spanId: string | null) => {
    set({ selectedSpanId: spanId });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  getSelectedTrace: () => {
    const { traces, selectedTraceId } = get();
    if (!selectedTraceId) {
      return undefined;
    }
    // Strict lookup: NEVER fallback to traces[0]!
    return traces.find((t) => t.id === selectedTraceId);
  },

  getSelectedSpan: () => {
    const trace = get().getSelectedTrace();
    if (!trace) return undefined;
    const { selectedSpanId } = get();
    if (!selectedSpanId) return undefined;
    return trace.spans.find((s) => s.id === selectedSpanId);
  },
}));

// Subscribe to globalTraceManager updates
globalTraceManager.subscribe((traces) => {
  useTraceStore.setState({ traces });
});
