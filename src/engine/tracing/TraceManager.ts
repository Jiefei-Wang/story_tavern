import { TraceSpan, TurnTrace } from "../../types";

export class TraceManager {
  private activeTraces: Map<string, TurnTrace> = new Map();
  private completedTraces: TurnTrace[] = [];
  private listeners: Set<(traces: TurnTrace[]) => void> = new Set();

  startTurnTrace(traceId: string, turnNumber: number, playerInput: string): TurnTrace {
    const trace: TurnTrace = {
      id: traceId,
      turnNumber,
      playerInput,
      startedAt: Date.now(),
      status: "running",
      spans: [],
      totalTokens: 0,
    };
    this.activeTraces.set(traceId, trace);
    this.notify();
    return trace;
  }

  createSpan(
    traceId: string,
    spanId: string,
    name: string,
    type: string,
    parentId?: string,
    agentId?: string
  ): TraceSpan {
    const span: TraceSpan = {
      id: spanId,
      traceId,
      parentId,
      name,
      type,
      agentId,
      status: "running",
      startedAt: Date.now(),
    };

    const trace = this.activeTraces.get(traceId);
    if (trace) {
      trace.spans.push(span);
      this.notify();
    }
    return span;
  }

  updateSpan(traceId: string, spanId: string, updates: Partial<TraceSpan>): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    const span = trace.spans.find((s) => s.id === spanId);
    if (span) {
      Object.assign(span, updates);
      if (updates.status === "success" || updates.status === "error") {
        span.endedAt = updates.endedAt || Date.now();
        span.durationMs = span.endedAt - span.startedAt;
      }
      if (updates.tokenUsage?.total) {
        this.recalculateTotalTokens(trace);
      }
      this.notify();
    }
  }

  endTurnTrace(traceId: string, status: "success" | "error" = "success"): TurnTrace | undefined {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return undefined;

    trace.endedAt = Date.now();
    trace.durationMs = trace.endedAt - trace.startedAt;
    trace.status = status;
    this.recalculateTotalTokens(trace);

    this.activeTraces.delete(traceId);
    this.completedTraces.unshift(trace);

    // Keep last 100 traces
    if (this.completedTraces.length > 100) {
      this.completedTraces.pop();
    }

    this.notify();
    return trace;
  }

  private recalculateTotalTokens(trace: TurnTrace) {
    let tokens = 0;
    for (const span of trace.spans) {
      if (span.tokenUsage?.total) {
        tokens += span.tokenUsage.total;
      }
    }
    trace.totalTokens = tokens;
  }

  getTrace(traceId: string): TurnTrace | undefined {
    return (
      this.activeTraces.get(traceId) ||
      this.completedTraces.find((t) => t.id === traceId)
    );
  }

  getAllTraces(): TurnTrace[] {
    return [...Array.from(this.activeTraces.values()), ...this.completedTraces];
  }

  subscribe(listener: (traces: TurnTrace[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getAllTraces());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const all = this.getAllTraces();
    for (const listener of this.listeners) {
      listener(all);
    }
  }
}

export const globalTraceManager = new TraceManager();
