import { invoke } from "@tauri-apps/api/core";
import {
  AgentDefinition,
  AgentGroup,
  Backend,
  TraceSpan,
} from "../../types";
import { renderMessages } from "../template/PlaceholderEngine";
import { globalConcurrencyLimiter } from "../scheduling/ConcurrencyLimiter";
import { globalTraceManager } from "../tracing/TraceManager";
import { MockSimulator } from "./MockSimulator";

export interface RunAgentOptions {
  agentId: string;
  groupId: string;
  context: Record<string, any>;
  traceId?: string;
  parentSpanId?: string;
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

function extractJsonPayload(text: string): any {
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
      agents,
      groups,
      backends,
      mockMode = false,
    } = options;

    const spanId = `span_${agentId}_${Math.random().toString(36).substring(2, 9)}`;

    // 1. Resolve Agent Definition
    const agentDef = agents.find((a) => a.id === agentId);
    if (!agentDef) {
      return {
        success: false,
        data: null as any,
        spanId,
        error: `Agent definition not found: ${agentId}`,
      };
    }

    // 2. Resolve Agent Group & Binding
    const group = groups.find((g) => g.id === groupId) || groups[0];
    const binding = group?.bindings.find((b) => b.agentId === agentId);

    const backend = binding ? backends.find((b) => b.id === binding.backendId) : backends[0];
    const model = binding?.model || "default-model";

    // 3. Create Trace Span
    const span = globalTraceManager.createSpan(
      traceId,
      spanId,
      agentDef.name || agentId,
      "agent_call",
      parentSpanId,
      agentId
    );

    // Record initial snapshot
    globalTraceManager.updateSpan(traceId, spanId, {
      backendId: backend?.id,
      model,
      inputContext: context,
      templateMessages: agentDef.messages,
    });

    // 4. Merge parameters
    const temperature =
      binding?.overrides?.temperature ??
      agentDef.defaults.temperature ??
      0.7;
    const maxTokens =
      binding?.overrides?.maxTokens ??
      agentDef.defaults.maxTokens ??
      1500;
    const topP =
      binding?.overrides?.topP ??
      agentDef.defaults.topP ??
      1.0;
    const extraBody = {
      ...(agentDef.defaults.extraBody || {}),
      ...(binding?.overrides?.extraBody || {}),
    };

    const requestParams = {
      model,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      ...extraBody,
    };

    // 5. Render placeholders into messages
    const resolvedMessages = renderMessages(agentDef.messages, context);
    globalTraceManager.updateSpan(traceId, spanId, {
      resolvedMessages,
      requestParams,
    });

    // 6. Execute Mock or Real
    if (mockMode) {
      // Mock mode strictly for offline unit tests and isolated evaluation
      await new Promise((r) => setTimeout(r, 100));
      try {
        const mockResult = MockSimulator.simulate(agentId, context, agentDef);

        globalTraceManager.updateSpan(traceId, spanId, {
          status: "success",
          rawResponse: JSON.stringify(mockResult, null, 2),
          parsedOutput: mockResult,
          tokenUsage: {
            prompt: 150,
            completion: 200,
            total: 350,
          },
        });

        return {
          success: true,
          data: mockResult,
          spanId,
        };
      } catch (err: any) {
        globalTraceManager.updateSpan(traceId, spanId, {
          status: "error",
          error: err?.message || String(err),
        });
        return {
          success: false,
          data: null as any,
          spanId,
          error: err?.message || String(err),
        };
      }
    }

    if (!backend) {
      const errorMsg = `智能体 [${agentDef.name || agentId}] 未绑定有效的 Backend 服务的模型端点。请在“智能体分组”或“后端服务”中检查绑定配置。`;
      globalTraceManager.updateSpan(traceId, spanId, {
        status: "error",
        error: errorMsg,
      });
      return {
        success: false,
        data: null as any,
        spanId,
        error: errorMsg,
      };
    }

    // 7. Real LLM execution through Concurrency Limiter & Rust HTTP layer / fetch
    try {
      const response = await globalConcurrencyLimiter.run(
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
              secretRef: backend.secretRef || null,
              headers: backend.customHeaders || {},
              timeoutMs: backend.timeoutMs || 60000,
              request: payload,
            });
          } else {
            // Web / Node / Non-Tauri fallback for direct LLM execution
            let token = "";
            const globalProc = (globalThis as any)?.process;
            if (typeof globalProc !== "undefined" && globalProc?.env) {
              token = globalProc.env.OPENROUTER_KEY || globalProc.env.openrouter_key || "";
            }
            if (!token && typeof localStorage !== "undefined") {
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
            if (token) {
              headers["Authorization"] = `Bearer ${token.trim()}`;
            }

            const url = `${backend.baseUrl.replace(/\/+$/, "")}/chat/completions`;
            const res = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`HTTP ${res.status}: ${errText}`);
            }

            return await res.json();
          }
        }
      );

      const content = response?.choices?.[0]?.message?.content || "";
      const usage = response?.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      let parsedData: any = content;
      if (agentDef.outputSchema !== null) {
        try {
          parsedData = extractJsonPayload(content);
        } catch (jsonErr: any) {
          throw new Error(`Output schema expects JSON, but parsing failed: ${jsonErr.message}`);
        }
      }

      globalTraceManager.updateSpan(traceId, spanId, {
        status: "success",
        rawResponse: response,
        parsedOutput: parsedData,
        tokenUsage: {
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
          total: usage.total_tokens,
        },
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
