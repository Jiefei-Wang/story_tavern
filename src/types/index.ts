// Core Types for Story Tavern AI RPG Engine

export type AuthType = "bearer" | "none";

export interface Backend {
  id: string;
  name: string;
  baseUrl: string;
  authType: AuthType;
  secretRef?: string;
  customHeaders: Record<string, string>;
  timeoutMs: number;
  maxConcurrency: number;
  enabled: boolean;
  defaultModel?: string;
  models?: string[];
  status?: "online" | "offline" | "unknown";
  lastTestedAt?: string;
}

export interface AgentMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AgentInputDefinition {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  version?: string;
  updatedAt?: string;
  messages: AgentMessage[];
  inputs: AgentInputDefinition[];
  outputSchema: Record<string, unknown> | null;
  defaults: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    extraBody?: Record<string, unknown>;
  };
}

export interface AgentBindingOverrides {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  extraBody?: Record<string, unknown>;
}

export interface AgentBinding {
  agentId: string;
  backendId: string;
  model: string;
  overrides?: AgentBindingOverrides;
}

export interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  bindings: AgentBinding[];
  updatedAt?: string;
}

export type EventType = "action" | "speech" | "wait" | "time_skip" | "admin";

export interface GameEvent {
  id: string;
  type: EventType;
  actor?: string;
  op?: string;
  target?: string;
  content?: string;
  duration?: number;
  parallelWith?: string[];
  details?: Record<string, unknown>;
}

export interface TemporalBlock {
  id: string;
  kind: "normal" | "wait" | "time_skip" | "admin";
  events?: GameEvent[];
  responseWindow?: boolean;
  duration?: number;
  to?: string;
  command?: string;
}

export interface InputCompilerResult {
  blocks: TemporalBlock[];
}

export interface NPCObservation {
  eventId: string;
  saw: boolean;
  heard: boolean;
  content?: string;
}

export interface PerceptionResult {
  npcObservations: Record<string, NPCObservation[]>;
}

export interface NPCIntent {
  type: "action" | "speech" | "wait";
  op?: string;
  target?: string;
  content?: string;
  duration?: number;
}

export interface NPCReactionResult {
  thought: string | null;
  mentalUpdates?: Array<{
    aspect: string;
    newValue: unknown;
  }>;
  intents: NPCIntent[];
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export interface PublicWorldEvent {
  id?: string;
  actor: string;
  type: "action" | "speech" | "environment";
  op?: string;
  target?: string;
  content?: string;
  duration?: number;
  sourceIntentId?: string;
}

export interface CommittedTurnEvent {
  type:
    | "player_action"
    | "player_speech"
    | "npc_action"
    | "npc_speech"
    | "environment"
    | "wait"
    | "time_skip"
    | "admin_change";
  actor?: string;
  blockId: string;
  source?: unknown;
  public?: boolean;
  content?: string;
  op?: string;
  target?: string;
  patches?: JsonPatchOperation[];
}

export type EntityType = "character" | "object" | "location" | "item";

export interface WorldEntity {
  type: EntityType;
  name?: string;
  location?: string;
  mentalState?: {
    mood?: string;
    [key: string]: unknown;
  };
  relationships?: Record<string, number>;
  goal?: string;
  memory?: string;
  open?: boolean;
  locked?: boolean;
  [key: string]: unknown;
}

export interface WorldState {
  clock: string;
  scene: {
    location: string;
    weather: string;
    lighting: string;
    description?: string;
  };
  entities: Record<string, WorldEntity>;
  rules: Record<string, unknown>;
}

export interface WorldResolverResult {
  patches: JsonPatchOperation[];
  publicEvents?: PublicWorldEvent[];
  rejectedIntents?: Array<{ intent: NPCIntent; reason: string }>;
  narrationHints?: string[];
}

export interface TraceSpan {
  id: string;
  traceId: string;
  parentId?: string;
  blockId?: string;
  blockIndex?: number;
  name: string;
  type: string;
  agentId?: string;
  backendId?: string;
  model?: string;
  status: "pending" | "running" | "success" | "error";
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  inputContext?: unknown;
  templateMessages?: unknown;
  resolvedMessages?: unknown;
  requestParams?: unknown;
  rawResponse?: unknown;
  parsedOutput?: unknown;
  statePatch?: unknown;
  tokenUsage?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  error?: string;
}

export interface TurnTrace {
  id: string;
  turnNumber: number;
  playerInput: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: "success" | "error" | "running";
  spans: TraceSpan[];
  totalTokens: number;
}

export interface GameTurn {
  id: string;
  turnIndex: number;
  timestamp: string;
  playerInput: string;
  narratorOutput: string;
  traceId: string;
  worldStateBefore: WorldState;
  worldStateAfter: WorldState;
  patches: JsonPatchOperation[];
  activeAgentGroupId: string;
  status?: "success" | "error";
  error?: string;
  narrationError?: string;
  variations?: GameTurn[];
  activeVariationIndex?: number;
}

export interface GameSave {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  worldState: WorldState;
  turns: GameTurn[];
  activeAgentGroupId: string;
}

export interface AppSettings {
  language: "zh-CN" | "en-US";
  theme: "light" | "system";
  developerMode: boolean;
  mockLlmMode: boolean;
  autosave: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  dataDirectory?: string;
}
