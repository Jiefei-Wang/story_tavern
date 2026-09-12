import { TraceSpan, TurnTrace } from "../../types";

export class TraceManager {
  private activeTraces: Map<string, TurnTrace> = new Map();
  private completedTraces: TurnTrace[] = [];
  private listeners: Set<(traces: TurnTrace[]) => void> = new Set();
  private onTraceCompleted?: (trace: TurnTrace) => void;

  setOnTraceCompleted(handler: (trace: TurnTrace) => void) {
    this.onTraceCompleted = handler;
  }

  loadCompletedTraces(traces: TurnTrace[]): void {
    this.completedTraces = [...traces];
    this.notify();
  }

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

  isActiveTrace(traceId: string): boolean {
    return this.activeTraces.has(traceId);
  }

  createSpan(
    traceId: string,
    spanId: string,
    name: string,
    type: string,
    parentId?: string,
    agentId?: string,
    blockId?: string,
    blockIndex?: number
  ): TraceSpan {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`Cannot create span '${spanId}': active parent trace '${traceId}' does not exist`);
    }

    const span: TraceSpan = {
      id: spanId,
      traceId,
      parentId,
      blockId,
      blockIndex,
      name,
      type,
      agentId,
      status: "running",
      startedAt: Date.now(),
    };

    trace.spans.push(span);
    this.notify();
    return span;
  }

  updateSpan(traceId: string, spanId: string, updates: Partial<TraceSpan>): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    const span = trace.spans.find((s) => s.id === spanId);
    if (span) {
      // Snapshot mutations to guarantee debug trace fidelity
      const clonedUpdates = { ...updates };
      if (clonedUpdates.inputContext !== undefined) {
        clonedUpdates.inputContext = structuredClone(clonedUpdates.inputContext);
      }
      if (clonedUpdates.templateMessages !== undefined) {
        clonedUpdates.templateMessages = structuredClone(clonedUpdates.templateMessages);
      }
      if (clonedUpdates.resolvedMessages !== undefined) {
        clonedUpdates.resolvedMessages = structuredClone(clonedUpdates.resolvedMessages);
      }
      if (clonedUpdates.requestParams !== undefined) {
        clonedUpdates.requestParams = structuredClone(clonedUpdates.requestParams);
      }
      if (clonedUpdates.parsedOutput !== undefined) {
        clonedUpdates.parsedOutput = structuredClone(clonedUpdates.parsedOutput);
      }
      if (clonedUpdates.statePatch !== undefined) {
        clonedUpdates.statePatch = structuredClone(clonedUpdates.statePatch);
      }

      Object.assign(span, clonedUpdates);

      if (clonedUpdates.status === "success" || clonedUpdates.status === "error") {
        span.endedAt = clonedUpdates.endedAt || Date.now();
        span.durationMs = span.endedAt - span.startedAt;
      }
      if (clonedUpdates.tokenUsage?.total) {
        this.recalculateTotalTokens(trace);
      }
      this.notify();
    }
  }

  endTurnTrace(traceId: string, status: "success" | "error" | "cancelled" = "success"): TurnTrace | undefined {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return undefined;

    trace.endedAt = Date.now();
    trace.durationMs = trace.endedAt - trace.startedAt;
    trace.status = status;
    this.recalculateTotalTokens(trace);

    this.activeTraces.delete(traceId);
    this.completedTraces.unshift(trace);

    // Keep up to 500 completed traces in memory
    if (this.completedTraces.length > 500) {
      this.completedTraces.pop();
    }

    if (this.onTraceCompleted) {
      try {
        this.onTraceCompleted(trace);
      } catch (err) {
        console.error("Failed in onTraceCompleted callback:", err);
      }
    }

    this.notify();
    return trace;
  }

  cancelTurnTrace(traceId: string): TurnTrace | undefined {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return undefined;

    trace.endedAt = Date.now();
    trace.durationMs = trace.endedAt - trace.startedAt;
    trace.status = "cancelled";
    for (const span of trace.spans) {
      if (span.status === "running" || span.status === "pending") {
        span.status = "cancelled";
        span.endedAt = Date.now();
        span.durationMs = span.endedAt - span.startedAt;
      }
    }
    this.recalculateTotalTokens(trace);
    this.activeTraces.delete(traceId);
    this.completedTraces.unshift(trace);

    if (this.completedTraces.length > 500) {
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
    try {
      listener(this.getAllTraces());
    } catch (err) {
      console.error("TraceManager listener initial call error:", err);
    }
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const all = this.getAllTraces();
    for (const listener of this.listeners) {
      try {
        listener(all);
      } catch (e) {
        console.error("Error in TraceManager listener:", e);
      }
    }
  }
}

export const globalTraceManager = new TraceManager();
