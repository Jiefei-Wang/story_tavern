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

const RESERVED_BODY_FIELDS = new Set([
  "model",
  "messages",
  "temperature",
  "max_tokens",
  "top_p",
  "stream",
]);

export function sanitizeExtraBody(extraBody?: Record<string, any>): Record<string, any> {
  if (!extraBody || typeof extraBody !== "object") return {};
  for (const key of Object.keys(extraBody)) {
    if (RESERVED_BODY_FIELDS.has(key.toLowerCase())) {
      throw new AgentRuntimeError(
        `extraBody contains forbidden reserved field '${key}'. Overriding core parameters (model, messages, temperature, max_tokens, top_p) via extraBody is strictly prohibited.`,
        "agent_runtime"
      );
    }
  }
  return { ...extraBody };
}

const FORBIDDEN_TRANSPORT_HEADERS = new Set([
  "authorization",
  "content-length",
  "host",
]);

export function sanitizeCustomHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  for (const key of Object.keys(headers)) {
    if (FORBIDDEN_TRANSPORT_HEADERS.has(key.toLowerCase().trim())) {
      throw new AgentRuntimeError(
        `Custom header '${key}' is forbidden and cannot override protected transport headers.`,
        "agent_runtime"
      );
    }
  }
  return { ...headers };
}

export class AgentRuntime {
  async runAgent<T = any>(options: RunAgentOptions): Promise<RunAgentResult<T>> {
    const {
      agentId,
      groupId,
      context,
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
    const traceId = options.traceId || `tr_${Date.now()}_${uuid}`;

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

    // 2. Ensure Trace exists for standalone runs
    const isStandaloneTrace = !globalTraceManager.isActiveTrace(traceId);
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

    // Group Validation (Fail-Fast in both Real and Mock mode: if groupId is provided, it must exist)
    if (groupId) {
      const groupExists = groups.some((g) => g.id === groupId);
      if (!groupExists) {
        const errMsg = `Agent Group '${groupId}' not found`;
        globalTraceManager.updateSpan(traceId, spanId, {
          status: "error",
          error: errMsg,
        });
        if (isStandaloneTrace) {
          globalTraceManager.endTurnTrace(traceId, "error");
        }
        return {
          success: false,
          data: null as any,
          spanId,
          error: errMsg,
        };
      }
    }

    // 3. Mock Mode Branch: Truly does NOT require Backend, Binding, or Model!
    if (mockMode) {
      let mockSuccess = false;
      try {
        const group = groups.find((g) => g.id === groupId);
        const binding = group?.bindings?.find((b) => b.agentId === agentId);
        const backend = backends.find((b) => b.id === binding?.backendId);
        const model = binding?.model || backend?.defaultModel || "mock-model";

        const resolvedMessages = renderMessages(agentDef.messages, context);
        globalTraceManager.updateSpan(traceId, spanId, {
          backendId: backend?.id || "mock",
          model,
          inputContext: structuredClone(context),
          templateMessages: structuredClone(agentDef.messages),
          resolvedMessages: structuredClone(resolvedMessages),
          requestParams: { model, mockMode: true },
        });

        await new Promise((r) => setTimeout(r, 20));
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

        mockSuccess = true;
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
      } finally {
        if (isStandaloneTrace) {
          globalTraceManager.endTurnTrace(traceId, mockSuccess ? "success" : "error");
        }
      }
    }

    // 4. Real Mode: Strict Resolution of Group, Binding, Backend, Enabled, and Model
    let runSuccess = false;
    try {
      // Resolve Agent Group (Fail-Fast: NO silent fallback to groups[0])
      const group = groups.find((g) => g.id === groupId);
      if (!group) {
        throw new AgentRuntimeError(`Agent Group '${groupId}' not found`, agentId);
      }

      // Resolve Binding (Fail-Fast: NO silent fallback to backends[0])
      const binding = group.bindings.find((b) => b.agentId === agentId);
      if (!binding) {
        throw new AgentRuntimeError(
          `Agent '${agentId}' has no binding in group '${groupId}'`,
          agentId
        );
      }

      // Resolve Backend (Fail-Fast)
      const backend = backends.find((b) => b.id === binding.backendId);
      if (!backend) {
        throw new AgentRuntimeError(
          `Backend '${binding.backendId}' not found for agent '${agentId}'`,
          agentId
        );
      }

      // Backend Enabled Check (Fail-Fast)
      if (!backend.enabled) {
        throw new AgentRuntimeError(`Backend '${backend.name}' is disabled`, agentId);
      }

      // Model Specification Check (Fail-Fast: NO silent fallback to "default-model")
      const model = binding.model || backend.defaultModel;
      if (!model || model.trim() === "") {
        throw new AgentRuntimeError(
          `No model specified for agent '${agentId}' in group '${groupId}'`,
          agentId
        );
      }

      // Merge & sanitize parameters
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

      // Sanitize extraBody to forbid overriding reserved fields
      const rawExtraBody = {
        ...(agentDef.defaults.extraBody || {}),
        ...(binding.overrides?.extraBody || {}),
      };
      const sanitizedExtraBody = sanitizeExtraBody(rawExtraBody);

      // Sanitize customHeaders to forbid overriding transport headers
      const sanitizedHeaders = sanitizeCustomHeaders(backend.customHeaders);

      const requestParams = {
        model,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        ...sanitizedExtraBody,
      };

      // Render placeholders into messages
      const resolvedMessages = renderMessages(agentDef.messages, context);

      // Record immutable snapshot with exact request parameters
      globalTraceManager.updateSpan(traceId, spanId, {
        backendId: backend.id,
        model,
        inputContext: structuredClone(context),
        templateMessages: structuredClone(agentDef.messages),
        resolvedMessages: structuredClone(resolvedMessages),
        requestParams: structuredClone(requestParams),
      });

      // Real LLM execution through Concurrency Limiter & Tauri/Browser HTTP
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
              headers: sanitizedHeaders,
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
              const authType = backend.authType || "bearer";

              if (authType === "bearer") {
                const sRef = backend.secretRef ? backend.secretRef.trim() : "";
                if (sRef === "backend_openrouter" || sRef === "secret_openrouter_default") {
                  const globalProc = (globalThis as any)?.process;
                  if (typeof globalProc !== "undefined" && globalProc?.env) {
                    token = globalProc.env.OPENROUTER_KEY || globalProc.env.openrouter_key || "";
                  }
                  if (!token && typeof localStorage !== "undefined") {
                    token =
                      localStorage.getItem("openrouter_key") ||
                      localStorage.getItem(`secret_${sRef}`) ||
                      "";
                  }
                  if (!token && (import.meta as any)?.env?.VITE_OPENROUTER_KEY) {
                    token = (import.meta as any).env.VITE_OPENROUTER_KEY;
                  }
                } else if (sRef) {
                  // Only check specific secretRef; ZERO fallback to openrouter!
                  if (typeof localStorage !== "undefined") {
                    token = localStorage.getItem(`secret_${sRef}`) || "";
                  }
                }

                if (!token || token.trim() === "") {
                  throw new Error(
                    `Missing Bearer credential for backend '${backend.name}' (secretRef: '${backend.secretRef || "none"}')`
                  );
                }
              }

              const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...sanitizedHeaders,
              };

              if (authType === "bearer") {
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

      runSuccess = true;
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
    } finally {
      if (isStandaloneTrace) {
        globalTraceManager.endTurnTrace(traceId, runSuccess ? "success" : "error");
      }
    }
  }
}

export const agentRuntime = new AgentRuntime();
