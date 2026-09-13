import { withCharacterContract } from "../character-schema/AgentContract";
import { withConversationContract } from "./ConversationContracts";
import { withInputAuthorityContract } from "./InputAuthority";
import { invoke, createChannel, hasLocalHost } from "../../db/host";
import { OpenAIStream } from "./OpenAIStream";
import {
  AgentDefinition,
  AgentGroup,
  Backend,
} from "../../types";
import { renderAgentPrompt, getAgentPrompt } from "../template/AgentPrompt";
import { renderMessages } from "../template/PlaceholderEngine";
import { globalConcurrencyLimiter } from "../scheduling/ConcurrencyLimiter";
import { globalTraceManager } from "../tracing/TraceManager";
import { MockSimulator } from "./MockSimulator";
import { AgentRuntimeError } from "../errors/PipelineStageError";
import { SchemaValidator } from "../schema/SchemaValidator";
import { parseOpenAIResponse } from "./OpenAIResponseParser";
import type {ParsedOpenAIResponse} from './OpenAIResponseParser';
export interface RuntimeMessage {role:'system'|'user'|'assistant'|'tool';content:string;tool_calls?:ParsedOpenAIResponse['toolCalls'];tool_call_id?:string}

export interface RunAgentOptions {
  promptMode?: boolean;
  toolSchema?: Record<string,unknown>;
  /** Small routing and batched Designer JSON; narrator remains natural prose. */
  jsonObject?: boolean;
  conversation?: RuntimeMessage[];
  /** Internal bound: at most one additional request for JSON-shaped syntax errors. */
  formatRetryAttempt?: 0 | 1;
  instructions?: string;
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
  signal?: AbortSignal;
}

export interface RunAgentResult<T = any> {
  toolCalls?: ParsedOpenAIResponse['toolCalls'];
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
    if (options.signal?.aborted) {
      const err = new Error("Generation aborted by user");
      err.name = "AbortError";
      throw err;
    }

    const savedDefinition = agents.find((a) => a.id === agentId);
    const agentDef = savedDefinition ? agentId.startsWith('text_') ? {...savedDefinition,outputSchema:null} : withInputAuthorityContract(withCharacterContract(withConversationContract(savedDefinition), context.characterSchema), context.player?.input) : undefined;
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
    globalTraceManager.updateSpan(traceId, spanId, {
      generationStatus: "queued",
      displayLabel: agentId === "npc_reaction" ? `角色反应 · ${context.npc?.name || "NPC"}` :
        agentId === "character_generator" ? `人物生成 · 第 ${context.ordinal || 1} 位` : undefined,
    });

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

        const resolvedMessages:RuntimeMessage[] = options.promptMode || agentDef.prompt !== undefined ? [{ role: 'user', content: renderAgentPrompt(agentDef, { ...context, retry: options.instructions || context.retry || '' }) }] : renderMessages(agentDef.messages, context);
        if (!options.promptMode && agentDef.prompt === undefined && options.conversation) resolvedMessages.push(...options.conversation);
        if (!options.promptMode && agentDef.prompt === undefined && options.instructions) resolvedMessages.push({ role: "system", content: options.instructions });
        globalTraceManager.updateSpan(traceId, spanId, {
          backendId: backend?.id || "mock",
          model,
          inputContext: structuredClone(context),
          templateMessages: options.promptMode || agentDef.prompt !== undefined ? [{ id: 'prompt', role: 'user', content: getAgentPrompt(agentDef) }] : structuredClone(agentDef.messages),
          resolvedMessages: structuredClone(resolvedMessages),
          requestParams: { model, mockMode: true },
        });

        if (options.signal) {
          if (options.signal.aborted) {
            const err = new Error("Generation aborted by user");
            err.name = "AbortError";
            throw err;
          }
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 20);
            const onAbort = () => {
              clearTimeout(timer);
              const err = new Error("Generation aborted by user");
              err.name = "AbortError";
              reject(err);
            };
            options.signal?.addEventListener("abort", onAbort, { once: true });
          });
        } else {
          await new Promise((r) => setTimeout(r, 20));
        }

        const mockResult = MockSimulator.simulate(agentId, context, agentDef);
        globalTraceManager.updateSpan(traceId, spanId, {
          liveContent: typeof mockResult === "string" ? mockResult : JSON.stringify(mockResult, null, 2),
          rawResponse: JSON.stringify(mockResult, null, 2),
          parsedOutput: structuredClone(mockResult),
        });

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
        const isAbort = options.signal?.aborted === true;
        const errMsg = isAbort ? "Generation aborted by user" : err?.message || String(err);
        globalTraceManager.updateSpan(traceId, spanId, {
          status: isAbort ? "cancelled" : "error",
          error: errMsg,
        });
        if (isAbort) {
          const abortErr = new Error("Generation aborted by user");
          abortErr.name = "AbortError";
          throw abortErr;
        }
        return {
          success: false,
          data: null as any,
          spanId,
          error: errMsg,
        };
      } finally {
        if (isStandaloneTrace) {
          globalTraceManager.endTurnTrace(traceId, options.signal?.aborted ? "cancelled" : mockSuccess ? "success" : "error");
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
        0;
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
        ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
        top_p: topP,
        reasoning_effort: binding.overrides?.reasoningEffort ?? "none",
        ...sanitizedExtraBody,
        ...(options.jsonObject ? {response_format:{type:'json_object'}} : {}),
        ...(options.toolSchema ? {tools:[{type:'function',function:{name:'document_command',description:'调用一个受限文档操作，等待真实工具结果后继续。',parameters:options.toolSchema}}],tool_choice:{type:'function',function:{name:'document_command'}},parallel_tool_calls:false} : {}),
      };

      // Render placeholders into messages
      const resolvedMessages:RuntimeMessage[] = options.promptMode || agentDef.prompt !== undefined ? [{ role: 'user', content: renderAgentPrompt(agentDef, { ...context, retry: options.instructions || context.retry || '' }) }] : renderMessages(agentDef.messages, context);
      if (!options.promptMode && agentDef.prompt === undefined && options.conversation) resolvedMessages.push(...options.conversation);
      if (!options.promptMode && agentDef.prompt === undefined && options.instructions) resolvedMessages.push({ role: "system", content: options.instructions });

      // Record immutable snapshot with exact request parameters
      globalTraceManager.updateSpan(traceId, spanId, {
        backendId: backend.id,
        model,
        inputContext: structuredClone(context),
        templateMessages: options.promptMode || agentDef.prompt !== undefined ? [{ id: 'prompt', role: 'user', content: getAgentPrompt(agentDef) }] : structuredClone(agentDef.messages),
        resolvedMessages: structuredClone(resolvedMessages),
        requestParams: structuredClone({ ...requestParams, stream: !options.toolSchema }),
      });

      // Real LLM execution through Concurrency Limiter & Tauri/Browser HTTP
      const rawResponse = await globalConcurrencyLimiter.run(
        backend.id,
        backend.maxConcurrency || 1,
        async () => {
          if (options.signal?.aborted) {
            const err = new Error("Generation aborted by user");
            err.name = "AbortError";
            throw err;
          }
          const payload = {
            ...requestParams,
            messages: resolvedMessages,
            stream: !options.toolSchema,
          };
          globalTraceManager.updateSpan(traceId, spanId, { generationStatus: "generating" });
          let lastPublish = 0;
          let latestContent = "";
          const stream = new OpenAIStream((text) => {
            latestContent = text;
            if (Date.now() - lastPublish > 80) {
              lastPublish = Date.now();
              globalTraceManager.updateSpan(traceId, spanId, { liveContent: text });
            }
          });
          const finishStream = () => {
            const result = stream.finish();
            globalTraceManager.updateSpan(traceId, spanId, { liveContent: latestContent });
            return result;
          };

          const isTauri = hasLocalHost();

          if (isTauri) {
            const decoder = new TextDecoder();
            let streamError: unknown;
            const onChunk = createChannel<number[]>();
            onChunk.onmessage = (bytes) => {
              if (streamError) return;
              if (options.signal?.aborted) {
                const err = new Error("Generation aborted by user");
                err.name = "AbortError";
                streamError = err;
                return;
              }
              try { stream.push(decoder.decode(new Uint8Array(bytes), { stream: true })); }
              catch (error) { streamError = error; }
            };
            const response = await invoke<any>("backend_chat_completion", {
              baseUrl: backend.baseUrl,
              authType: backend.authType || "bearer",
              secretRef: backend.secretRef || null,
              headers: sanitizedHeaders,
              timeoutMs: backend.timeoutMs || 60000,
              request: payload,
              onChunk,
            }, options.signal);
            if (streamError) throw streamError;
            if (options.signal?.aborted) {
              const err = new Error("Generation aborted by user");
              err.name = "AbortError";
              throw err;
            }
            if (response !== null) return response;
            stream.push(decoder.decode());
            return finishStream();
          } else {
            // Web / Node fallback with AbortController timeout
            const timeoutMs = backend.timeoutMs || 60000;
            const controller = new AbortController();
            let timedOut = false;
            const timeoutTimer = setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs);
            let removeAbortListener: (() => void) | undefined;
            if (options.signal) {
              if (options.signal.aborted) {
                controller.abort();
              } else {
                const onUserAbort = () => controller.abort();
                options.signal.addEventListener("abort", onUserAbort, { once: true });
                removeAbortListener = () => options.signal?.removeEventListener("abort", onUserAbort);
              }
            }

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

              if (!res.headers.get("content-type")?.includes("text/event-stream")) return await res.json();
              if (!res.body) throw new Error("后端未返回流式响应体");
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              try {
                while (true) {
                  if (options.signal?.aborted) {
                    const err = new Error("Generation aborted by user");
                    err.name = "AbortError";
                    throw err;
                  }
                  const { value, done } = await reader.read();
                  if (done) break;
                  stream.push(decoder.decode(value, { stream: true }));
                }
                stream.push(decoder.decode());
                return finishStream();
              } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
            } catch (error) {
              // This controller also serves the backend deadline. Only the caller's
              // signal can identify a user cancellation; fetch AbortError cannot.
              if (timedOut && !options.signal?.aborted) {
                throw new AgentRuntimeError(`Backend request timed out after ${timeoutMs} ms`, agentId);
              }
              throw error;
            } finally {
              clearTimeout(timeoutTimer);
              removeAbortListener?.();
            }
          }
        },
        options.signal
      );

      // Keep rejected responses reviewable. Recording evidence does not mark a span successful.
      globalTraceManager.updateSpan(traceId, spanId, { rawResponse });
      // Parse and strictly validate response structure
      const { content, tokenUsage, toolCalls } = parseOpenAIResponse(rawResponse,options.toolSchema?'document_command':undefined);
      globalTraceManager.updateSpan(traceId, spanId, { liveContent: content });

      let parsedData: any = content;
      if (agentDef.outputSchema !== null && agentDef.outputSchema !== undefined) {
        let parsedJson = false;
        try {
          parsedData = extractJsonPayload(content);
          parsedJson = true;
          globalTraceManager.updateSpan(traceId, spanId, { parsedOutput: structuredClone(parsedData) });
          SchemaValidator.validateOrThrow(agentDef.outputSchema, parsedData, agentDef.id, content);
        } catch (jsonErr: any) {
          // A plain-text model refusal is evidence, not a formatting defect to repair.
          // Retry only syntactically JSON-shaped output; never alter bytes locally.
          const jsonShaped = /^(?:```(?:json)?\s*)?[{\[]/i.test(content.trim());
          if (!options.formatRetryAttempt && jsonShaped && !options.signal?.aborted) {
            const error = parsedJson ? jsonErr.message : `Output schema expects JSON, but parsing failed: ${jsonErr.message}`;
            globalTraceManager.updateSpan(traceId, spanId, { status: "error", error, tokenUsage });
            const retrySpanId = `${spanId}_format_retry`;
            globalTraceManager.createSpan(traceId, retrySpanId, "One bounded JSON format retry", "format_retry", spanId, undefined, blockId, blockIndex);
            globalTraceManager.updateSpan(traceId, retrySpanId, { inputContext: { attempt: 1, maximumAttempts: 1, cause: parsedJson ? "json_schema" : "json_syntax", originalSpanId: spanId }, parsedOutput: { originalContentPreserved: true } });
            try {
              const retry = await this.runAgent<T>({
                ...options, traceId, parentSpanId: retrySpanId, formatRetryAttempt: 1,
                instructions: `${options.instructions || ""}\n格式重试（唯一一次）：上一次回复未通过JSON解析或字段结构校验：${error.slice(0, 700)}。请重新完成同一任务并输出协议要求的合法 JSON；不要添加解释、不要变更权限或世界事实，不要把未执行的尝试写成成功。若你需要基于安全边界拒绝，仍可明确拒绝，不要求把拒绝改写成任务完成。严格字段协议：${JSON.stringify(agentDef.outputSchema)}`,
              });
              globalTraceManager.updateSpan(traceId, retrySpanId, { status: retry.success ? "success" : "error", error: retry.error, parsedOutput: { originalContentPreserved: true, successfulRetrySpanId: retry.success ? retry.spanId : undefined, retrySpanId: retry.spanId } });
              runSuccess = retry.success;
              return retry;
            } catch (retryError: any) {
              globalTraceManager.updateSpan(traceId, retrySpanId, { status: retryError?.name === "AbortError" ? "cancelled" : "error", error: retryError?.message || String(retryError) });
              throw retryError;
            }
          }
          if (parsedJson) throw jsonErr;
          throw new Error(`Output schema expects JSON, but parsing failed: ${jsonErr.message}`);
        }
      }

      globalTraceManager.updateSpan(traceId, spanId, {
        status: "success",
        rawResponse,
        parsedOutput: structuredClone(parsedData),
        liveContent: content,
        tokenUsage,
      });

      runSuccess = true;
      return {
        success: true,
        data: parsedData,
        spanId,
        toolCalls,
      };
    } catch (err: any) {
      const isAbort = options.signal?.aborted === true;
      const errMsg = isAbort ? "Generation aborted by user"
        : err?.name === "AbortError" ? `Backend transport aborted without user cancellation: ${err?.message || "AbortError"}`
        : err?.message || String(err);
      globalTraceManager.updateSpan(traceId, spanId, {
        status: isAbort ? "cancelled" : "error",
        error: errMsg,
      });

      if (isAbort) {
        const abortErr = new Error("Generation aborted by user");
        abortErr.name = "AbortError";
        throw abortErr;
      }

      return {
        success: false,
        data: null as any,
        spanId,
        error: errMsg,
      };
    } finally {
      if (isStandaloneTrace) {
        globalTraceManager.endTurnTrace(traceId, options.signal?.aborted ? "cancelled" : runSuccess ? "success" : "error");
      }
    }
  }
}

export const agentRuntime = new AgentRuntime();
