import { invoke } from "@tauri-apps/api/core";
import {
  AgentDefinition,
  AgentGroup,
  Backend,
} from "../../types";
import { renderMessages } from "../template/PlaceholderEngine";
import { globalConcurrencyLimiter } from "../scheduling/ConcurrencyLimiter";
import { globalTraceManager } from "../tracing/TraceManager";
import { MockSimulator } from "./MockSimulator";
import { AgentRuntimeError } from "../errors/PipelineStageError";
import { SchemaValidator } from "../schema/SchemaValidator";
import { parseOpenAIResponse } from "./OpenAIResponseParser";

export interface RunAgentOptions {
  agentId: string;
  groupId: string;
  context: Record<string, any>;
  traceId?: string;
  parentSpanId?: string;
  blockId?: string;
  blockIndex?: number;
  // Injected dependencies from stores:
  agents: AgentDefinition[];
  groups: AgentGroup[];
  backends: Backend[];
  mockMode?: boolean;
}

export interface RunAgentResult<T = any> {
  success: boolean;
  data: T;
  spanId: string;
  error?: string;
}

export function extractJsonPayload(text: string): any {
  const trimmed = text.trim();
  // Check for markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = codeBlockRegex.exec(trimmed);
  const target = match ? match[1].trim() : trimmed;

  try {
    return JSON.parse(target);
  } catch (err: any) {
    // Attempt relaxed cleanup (e.g. find first { or [ and last } or ])
    const firstBrace = target.search(/[\{\[]/);
    const lastBrace = target.search(/[\}\]][^}]*$/);
    if (firstBrace !== -1 && lastBrace !== -1) {
      const sliced = target.substring(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }
    throw new Error(`Failed to parse JSON response: ${err.message}`);
  }
}

export class AgentRuntime {
  async runAgent<T = any>(options: RunAgentOptions): Promise<RunAgentResult<T>> {
    const {
      agentId,
      groupId,
      context,
      traceId = `tr_${Date.now()}`,
      parentSpanId,
      blockId,
      blockIndex,
      agents,
      groups,
      backends,
      mockMode = false,
    } = options;

    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const spanId = `span_${agentId}_${uuid}`;

    // 1. Resolve Agent Definition (Fail-Fast)
    const agentDef = agents.find((a) => a.id === agentId);
    if (!agentDef) {
      const errMsg = `Agent definition not found: ${agentId}`;
      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }

    // 2. Resolve Agent Group (Fail-Fast: NO silent fallback to groups[0])
    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      const errMsg = `Agent Group '${groupId}' not found`;
      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }

    // 3. Resolve Binding (Fail-Fast: NO silent fallback to backends[0])
    const binding = group.bindings.find((b) => b.agentId === agentId);
    if (!binding) {
      const errMsg = `Agent '${agentId}' has no binding in group '${groupId}'`;
      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }

    // 4. Resolve Backend (Fail-Fast)
    const backend = backends.find((b) => b.id === binding.backendId);
    if (!backend) {
      const errMsg = `Backend '${binding.backendId}' not found for agent '${agentId}'`;
      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }

    // 5. Backend Enabled Check (Fail-Fast)
    if (!backend.enabled) {
      const errMsg = `Backend '${backend.name}' is disabled`;
      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }

    // 6. Model Specification Check (Fail-Fast: NO silent fallback to "default-model")
    const model = binding.model || backend.defaultModel;
    if (!model || model.trim() === "") {
      const errMsg = `No model specified for agent '${agentId}' in group '${groupId}'`;
      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }

    // 7. Ensure Trace exists for standalone runs
    const isStandaloneTrace = !globalTraceManager.getTrace(traceId);
    if (isStandaloneTrace) {
      globalTraceManager.startTurnTrace(traceId, 0, `Standalone run: ${agentDef.name || agentId}`);
    }

    // Create Trace Span
    globalTraceManager.createSpan(
      traceId,
      spanId,
      agentDef.name || agentId,
      "agent_call",
      parentSpanId,
      agentId,
      blockId,
      blockIndex
    );

    // Record initial immutable snapshot
    globalTraceManager.updateSpan(traceId, spanId, {
      backendId: backend.id,
      model,
      inputContext: structuredClone(context),
      templateMessages: structuredClone(agentDef.messages),
    });

    // 8. Merge parameters
    const temperature =
      binding.overrides?.temperature ??
      agentDef.defaults.temperature ??
      0.7;
    const maxTokens =
      binding.overrides?.maxTokens ??
      agentDef.defaults.maxTokens ??
      1500;
    const topP =
      binding.overrides?.topP ??
      agentDef.defaults.topP ??
      1.0;
    const extraBody = {
      ...(agentDef.defaults.extraBody || {}),
      ...(binding.overrides?.extraBody || {}),
    };

    const requestParams = {
      model,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      ...extraBody,
    };

    // 9. Render placeholders into messages
    const resolvedMessages = renderMessages(agentDef.messages, context);
    globalTraceManager.updateSpan(traceId, spanId, {
      resolvedMessages: structuredClone(resolvedMessages),
      requestParams: structuredClone(requestParams),
    });

    // 10. Execute Mock Mode
    if (mockMode) {
      await new Promise((r) => setTimeout(r, 20));
      try {
        const mockResult = MockSimulator.simulate(agentId, context, agentDef);

        // Validate output schema if defined
        if (agentDef.outputSchema !== null && agentDef.outputSchema !== undefined) {
          SchemaValidator.validateOrThrow(
            agentDef.outputSchema,
            mockResult,
            agentDef.id,
            JSON.stringify(mockResult)
          );
        }

        globalTraceManager.updateSpan(traceId, spanId, {
          status: "success",
          rawResponse: JSON.stringify(mockResult, null, 2),
          parsedOutput: structuredClone(mockResult),
          tokenUsage: {
            prompt: 100,
            completion: 100,
            total: 200,
          },
        });

        return {
          success: true,
          data: mockResult,
          spanId,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        globalTraceManager.updateSpan(traceId, spanId, {
          status: "error",
          error: errMsg,
        });
        return {
          success: false,
          data: null as any,
          spanId,
          error: errMsg,
        };
      }
    }

    // 11. Real LLM execution through Concurrency Limiter & Tauri/Browser HTTP
    try {
      const rawResponse = await globalConcurrencyLimiter.run(
        backend.id,
        backend.maxConcurrency || 1,
        async () => {
          const payload = {
            ...requestParams,
            messages: resolvedMessages,
          };

          const isTauri =
            typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

          if (isTauri) {
            return await invoke<any>("backend_chat_completion", {
              baseUrl: backend.baseUrl,
              authType: backend.authType || "bearer",
              secretRef: backend.secretRef || null,
              headers: backend.customHeaders || {},
              timeoutMs: backend.timeoutMs || 60000,
              request: payload,
            });
          } else {
            // Web / Node fallback with AbortController timeout
            const timeoutMs = backend.timeoutMs || 60000;
            const controller = new AbortController();
            const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

            try {
              let token = "";
              const globalProc = (globalThis as any)?.process;
              if (typeof globalProc !== "undefined" && globalProc?.env) {
                token = globalProc.env.OPENROUTER_KEY || globalProc.env.openrouter_key || "";
              }
              if (!token && typeof localStorage !== "undefined" && backend.secretRef) {
                token =
                  localStorage.getItem(`secret_${backend.secretRef}`) ||
                  localStorage.getItem("openrouter_key") ||
                  "";
              }
              if (!token && (import.meta as any)?.env?.VITE_OPENROUTER_KEY) {
                token = (import.meta as any).env.VITE_OPENROUTER_KEY;
              }

              const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...(backend.customHeaders || {}),
              };

              const authType = backend.authType || "bearer";
              if (authType === "bearer") {
                if (!token) {
                  throw new Error(`Missing Bearer credential for backend '${backend.name}'`);
                }
                headers["Authorization"] = `Bearer ${token.trim()}`;
              }

              const url = `${backend.baseUrl.replace(/\/+$/, "")}/chat/completions`;
              const res = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
              });

              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errText}`);
              }

              return await res.json();
            } finally {
              clearTimeout(timeoutTimer);
            }
          }
        }
      );

      // Parse and strictly validate response structure
      const { content, tokenUsage } = parseOpenAIResponse(rawResponse);

      let parsedData: any = content;
      if (agentDef.outputSchema !== null && agentDef.outputSchema !== undefined) {
        try {
          parsedData = extractJsonPayload(content);
        } catch (jsonErr: any) {
          throw new Error(`Output schema expects JSON, but parsing failed: ${jsonErr.message}`);
        }

        // Validate parsed object against schema
        SchemaValidator.validateOrThrow(
          agentDef.outputSchema,
          parsedData,
          agentDef.id,
          content
        );
      }

      globalTraceManager.updateSpan(traceId, spanId, {
        status: "success",
        rawResponse,
        parsedOutput: structuredClone(parsedData),
        tokenUsage,
      });

      return {
        success: true,
        data: parsedData,
        spanId,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      globalTraceManager.updateSpan(traceId, spanId, {
        status: "error",
        error: errMsg,
      });

      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    }
  }
}

export const agentRuntime = new AgentRuntime();
