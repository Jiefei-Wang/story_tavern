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
  /** Editable complete prompt; messages remain only for old records/actions. */
  prompt?: string;
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

export const REASONING_EFFORT_OPTIONS = [
  { value: "none", label: "无" },
  { value: "minimal", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
  { value: "max", label: "最大" },
  { value: "ultra", label: "最强" },
] as const;

export type ReasoningEffort = typeof REASONING_EFFORT_OPTIONS[number]["value"];

export interface AgentBindingOverrides {
  reasoningEffort?: ReasoningEffort;
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
  item?: string;
  audibility?: "normal" | "whisper";
  audience?: string[];
  /** Source-anchored request to hear a present NPC respond; never player speech. */
  responseRequest?: { target: string; sourceText: string };
  outcome?: ActionOutcome;
}

export interface ActionOutcome { status: "success" | "failed"; summary: string; reason: string; }
/** Private runtime evidence, saved with the turn rather than writable world configuration. */
export interface NPCExperience { id: string; observation: NPCObservation; appliedStatePaths?: string[]; }

export interface TemporalBlock {
  id: string;
  kind: "normal" | "wait" | "time_skip" | "admin";
  events?: GameEvent[];
  responseWindow?: boolean;
  /** Scheduler-owned provenance; inferred from player input, never trusted from compiler output. */
  waitOrigin?: "explicit_elapsed" | "implicit_response";
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
  /** Public event semantics are copied from the authoritative event by Perception. */
  actor?: string;
  type?: EventType;
  op?: string;
  target?: string;
  content?: string;
  /** Observed duration in seconds. */
  duration?: number;
  outcome?: ActionOutcome;
  audibility?: "normal" | "whisper";
  audience?: string[];
}

export interface PerceptionResult {
  npcObservations: Record<string, NPCObservation[]>;
}

export interface SpeechBeat {
  kind?: string;
  meaning: string;
  required?: boolean;
}

export interface SpeechPlan {
  summary: string;
  beats?: SpeechBeat[];
  goal?: string;
  stance?: string;
  tone?: string;
  verbosity?: "brief" | "normal" | "detailed" | "extended";
  boundaries?: string[];
}

export interface NPCSpeechIntent {
  id?: string;
  type: "speech";
  target?: string;
  speechPlan: SpeechPlan;
  /** @deprecated Accepted only at legacy integration boundaries; agents must emit speechPlan. */
  content?: string;
  duration?: number;
}

export interface NPCIntent {
  id?: string;
  type: "action" | "speech" | "wait";
  op?: string;
  target?: string;
  content?: string;
  speechPlan?: SpeechPlan;
  duration?: number;
}

export interface NPCReactionResult {
  thought: string | null;
  stateUpdates?: CharacterStateUpdate[];
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
  speechPlan?: SpeechPlan;
  duration?: number;
  sourceIntentId?: string;
}

export interface CommittedTurnEvent {
  id: string;
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
  sourceIntentId?: string;
  speechPlan?: SpeechPlan;
  /** Surface realizations emitted by Narrator for this semantic speech. */
  realizedText?: string[];
  op?: string;
  target?: string;
  patches?: JsonPatchOperation[];
  outcome?: ActionOutcome;
}

export type EntityType = "character" | "object" | "location" | "item";

export interface WorldEntity {
  type: EntityType;
  name?: string;
  location?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, Record<string, unknown>>;
  open?: boolean;
  locked?: boolean;
  [key: string]: unknown;
}

export interface ConversationState {
  focusNpcId?: string;
  lastSpeakerId?: string;
  lastAddressedNpcId?: string;
}

export interface InteractionContext {
  addressed: boolean;
  maySpeak: boolean;
  speechPermission: "direct" | "ambient" | "interrupt" | "none";
}

export type NarratorSegment =
  | { type: "prose"; text: string; sourceEventIds?: string[] }
  | { type: "speech"; sourceIntentId: string; text: string }
  /** @deprecated Legacy custom narrator shape; built-in agents use prose/speech. */
  | { type: "narration"; text: string }
  | { type: "event_ref"; eventId: string };
export interface NarratorResult { segments: NarratorSegment[]; }

export interface WorldState {
  conversation?: ConversationState;
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
  acceptedStateUpdates?: Array<{ npcId: string; updateIndex: number }>;
}

export interface TraceSpan {
  liveContent?: string;
  generationStatus?: "queued" | "generating";
  displayLabel?: string;
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
  status: "pending" | "running" | "success" | "error" | "cancelled";
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
  status: "success" | "error" | "running" | "cancelled";
  spans: TraceSpan[];
  totalTokens: number;
}

export interface GameTurn {
  /** Program-owned request history; narratorOutput remains clean display text. */
  narration?: { anchor: number; requestText: string };
  textTurn?: import('../engine/text/types').TextTurnData;
  npcExperiences?: Record<string, NPCExperience[]>;
  /** Original legacy patch log retained for audit after snapshot/diff migration. */
  legacyPatches?: JsonPatchOperation[];
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
  /** Authoritative public events plus semantic speech and Narrator realizations. */
  committedEvents?: CommittedTurnEvent[];
  rejectedIntents?: Array<{ intent: NPCIntent; reason: string }>;
  status?: "success" | "error";
  error?: string;
  narrationError?: string;
  variations?: GameTurn[];
  activeVariationIndex?: number;
}

export interface GameSave {
  storyInfo?: { storyId: string; title: string; summary: string };
  textWorld?: import('../engine/text/types').TextWorld;
  legacyBackup?: unknown;
  worldDefinition: WorldDefinition;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  worldState: WorldState;
  turns: GameTurn[];
  activeAgentGroupId: string;
}

export interface WorldDefinition {
  version: number;
  characterSchema: CharacterSchemaDefinition;
}
export interface CharacterSchemaDefinition {
  version: number;
  sections: CharacterSectionDefinition[];
  relationship?: RelationshipSchemaDefinition;
}
export interface CharacterSectionDefinition { id: string; label: string; fields: CharacterFieldDefinition[] }
export interface RelationshipSchemaDefinition { label?: string; fields: CharacterFieldDefinition[] }
export interface CharacterFieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "integer" | "boolean" | "enum" | "list" | "object";
  description?: string;
  llmGuidance?: string;
  default?: unknown;
  visibility: "public" | "private";
  updatePolicy: "immutable" | "setup_only" | "dynamic" | "append_only";
  freedom: "strict" | "guided" | "free";
  required?: boolean;
  min?: number;
  max?: number;
  enumValues?: string[];
  item?: CharacterFieldDefinition;
  fields?: CharacterFieldDefinition[];
  changePolicy?: { mode?: "set" | "delta"; maxPerEvent?: number; maxPerTurn?: number };
}
export interface CharacterStateUpdate {
  path: string;
  op: "set" | "delta" | "append";
  value: unknown;
  reason?: string;
  sourceEventIds?: string[];
}

export interface AppSettings {
  behaviorGroundingVersion?: number;
  behaviorGroundingMigrated?: boolean;
  characterGenerationMigrated?: boolean;
  language: "zh-CN" | "en-US";
  theme: "light" | "system";
  developerMode: boolean;
  mockLlmMode: boolean;
  autosave: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  dataDirectory?: string;
}
