export type PipelineStage =
  | "character_effects"
  | "character_schema"
  | "input_compiler"
  | "perception"
  | "npc_reaction"
  | "world_resolver"
  | "time_skip"
  | "admin_patch"
  | "character_generator"
  | "narrator"
  | "patch_application"
  | "temporal_scheduler"
  | "routing"
  | "validation";

export class PipelineStageError extends Error {
  public readonly stage: PipelineStage;
  public readonly originalError?: unknown;
  public readonly details?: unknown;

  constructor(stage: PipelineStage, message: string, details?: unknown, originalError?: unknown) {
    super(`[PipelineStageError in ${stage}]: ${message}`);
    this.name = "PipelineStageError";
    this.stage = stage;
    this.details = details;
    this.originalError = originalError;
  }
}

export class AgentRuntimeError extends Error {
  public readonly agentId?: string;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, agentId?: string, code?: string, details?: unknown) {
    super(message);
    this.name = "AgentRuntimeError";
    this.agentId = agentId;
    this.code = code;
    this.details = details;
  }
}

/** Player-facing summaries must never contain raw transport, patch or world dumps. */
export function safePipelineError(error: unknown, traceId?: string): string {
  const stages: Record<PipelineStage, string> = {
    character_schema: "人物状态校验", character_effects: "人物状态提交", input_compiler: "输入理解", perception: "观察处理",
    npc_reaction: "人物反应", world_resolver: "世界裁决", time_skip: "时间推进",
    admin_patch: "管理员操作", character_generator: "人物生成", narrator: "旁白生成",
    patch_application: "状态提交", temporal_scheduler: "回合时序", routing: "对话路由", validation: "结果校验",
  };
  const value = error && typeof error === "object" ? error as { name?: string; stage?: string; message?: string } : {};
  if (value.name === "AbortError") return "生成已暂停。";
  const stage = typeof value.stage === "string" && Object.prototype.hasOwnProperty.call(stages, value.stage) ? value.stage as PipelineStage : undefined;
  const reference = traceId && /^[A-Za-z0-9_-]{1,128}$/.test(traceId) ? `（记录 ${traceId}）` : "";
  return `${stage ? stages[stage] : "本轮处理"}未完成，请重试或查看调试记录。${reference}`;
}
