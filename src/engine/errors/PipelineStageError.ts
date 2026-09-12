export type PipelineStage =
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
