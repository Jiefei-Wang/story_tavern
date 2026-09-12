import { create } from "zustand";
import { TraceSpan, TurnTrace } from "../types";
import { globalTraceManager } from "../engine/tracing/TraceManager";

interface TraceState {
  traces: TurnTrace[];
  selectedTraceId: string | null;
  selectedSpanId: string | null;
  activeTab: "graph" | "timeline";
  loadTraces: () => void;
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

  loadTraces: () => {
    const traces = globalTraceManager.getAllTraces();
    let selectedTraceId = get().selectedTraceId;
    if (!selectedTraceId && traces.length > 0) {
      selectedTraceId = traces[0].id;
    }
    set({ traces, selectedTraceId });
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
    if (!selectedTraceId) return traces[0];
    return traces.find((t) => t.id === selectedTraceId) || traces[0];
  },

  getSelectedSpan: () => {
    const trace = get().getSelectedTrace();
    if (!trace) return undefined;
    const { selectedSpanId } = get();
    if (!selectedSpanId) return trace.spans[0];
    return trace.spans.find((s) => s.id === selectedSpanId) || trace.spans[0];
  },
}));

// Subscribe AFTER store initialization
globalTraceManager.subscribe((traces) => {
  useTraceStore.setState((state) => {
    let selectedTraceId = state?.selectedTraceId;
    if (!selectedTraceId && traces.length > 0) {
      selectedTraceId = traces[0].id;
    }
    return { traces, selectedTraceId };
  });
});
