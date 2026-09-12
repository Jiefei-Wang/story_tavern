import { AgentDefinition, JsonPatchOperation, WorldEntity, WorldState } from "../../types";
import { agentRuntime, RunAgentOptions } from "../runtime/AgentRuntime";
import { applyPatches } from "../world/PatchEngine";
import { PipelineStageError } from "../errors/PipelineStageError";

const shortText = { type: "string", minLength: 1, maxLength: 240 };
export const CHARACTER_GENERATOR: AgentDefinition = {
  id: "character_generator", name: "人物生成", version: "v1.0",
  description: "新增人物时根据精简环境独立生成真实姓名、外貌及个人背景；不读取主线或其他人物私密信息。",
  messages: [
    { id: "system", role: "system", content: `你是人物生成器。根据精简的公开环境和本次玩家要求，为即将登场的一位全新成年人生成合理人物。
输出符合世界日期与地点文化的真实人名，姓名使用中文或中文音译，职业、物品和生活经历符合该年代。禁止把“漂亮女孩”“陌生人”“商人”等类别或形容词直接当姓名。
只生成你自己的个人经历、性格和日常目标。不知道主线剧情、幕后安排、其他人物秘密或玩家过去；禁止编造自己知晓这些内容，禁止建立与已有角色的旧关系。background 只写个人生活经历，goal 只写日常眼前目标。
人物应适应地点与时代氛围，同批次不同序号应有不同姓名和身份。玩家指定多人的情况下只生成当前序号对应的一位。
只输出 JSON：name、appearance、occupation、background、personality、goal、mood，全部为简短字符串。` },
    { id: "user", role: "user", content: "精简环境：{{json environment}}\n玩家本次要求：{{request}}\n当前人物序号：{{ordinal}} / {{count}}" },
  ],
  inputs: [
    { name: "environment", type: "object", description: "公开地点、天气与光照", required: true },
    { name: "request", type: "string", description: "玩家本次要求，不含历史或世界私密数据", required: true },
    { name: "ordinal", type: "number", description: "本批次人物序号", required: true },
    { name: "count", type: "number", description: "本批次人物数量", required: true },
  ],
  outputSchema: { type: "object", additionalProperties: false,
    properties: { name: { ...shortText, maxLength: 40 }, appearance: shortText, occupation: shortText, background: shortText, personality: shortText, goal: shortText, mood: shortText },
    required: ["name", "appearance", "occupation", "background", "personality", "goal", "mood"],
  },
  defaults: { temperature: 0.8, maxTokens: 1600 },
};

/** Whitelist only. Do not pass scene.description, rules, draft NPC fields or existing NPCs. */
export function characterEnvironment(world: WorldState) {
  return { location: world.scene.location, weather: world.scene.weather, lighting: world.scene.lighting, time: world.clock };
}

interface Profile { name: string; appearance: string; occupation: string; background: string; personality: string; goal: string; mood: string }

/** Preview the whole patch batch first, then replace newly introduced character drafts atomically.
 * Handles add/copy/replace and nested patches without allowing draft memories to survive. */
export async function generateNewCharacters(
  world: WorldState, patches: JsonPatchOperation[], request: string,
  options: Omit<RunAgentOptions, "agentId" | "context">,
): Promise<JsonPatchOperation[]> {
  const preview = applyPatches(world, patches);
  if (!preview.success) throw new PipelineStageError("patch_application", preview.error || "Invalid patches");
  const candidates = Object.entries(preview.newWorld.entities).filter(([id, entity]) =>
    entity.type === "character" && world.entities[id]?.type !== "character"
  );
  if (!candidates.length) return patches;
  if (candidates.length > 8) throw new PipelineStageError("character_generator", "单次最多生成 8 位新人物，请分批添加");
  // allSettled ensures all parallel calls finish before the transaction/trace is closed.
  const results = await Promise.allSettled(candidates.map(async ([id, draft], index) => {
    const result = await agentRuntime.runAgent<Profile>({ ...options, agentId: "character_generator", context: {
      environment: characterEnvironment(preview.newWorld), request, ordinal: index + 1, count: candidates.length,
    } });
    if (!result.success) throw new PipelineStageError("character_generator", result.error || "人物生成失败");
    const profile = result.data;
    if (!profile?.name?.trim() || /^(漂亮|美丽|美貌)?(女孩|少女|女人|男孩|男人|陌生人|商人)$/.test(profile.name.trim())) {
      throw new PipelineStageError("character_generator", "人物缺少真实姓名，请重试人物生成");
    }
    const entity: WorldEntity = {
      type: "character", name: profile.name.trim(),
      location: typeof draft.location === "string" ? draft.location : preview.newWorld.scene.location,
      appearance: profile.appearance, occupation: profile.occupation,
      background: profile.background, personality: profile.personality,
      memory: profile.background, goal: profile.goal, mentalState: { mood: profile.mood }, relationships: {},
    };
    return { op: "replace", path: `/entities/${id.replace(/~/g, "~0").replace(/\//g, "~1")}`, value: entity } as JsonPatchOperation;
  }));
  const failed = results.find(r => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const additions = results.map(r => (r as PromiseFulfilledResult<JsonPatchOperation>).value);
  const names = additions.map(p => (p.value as WorldEntity).name);
  if (new Set(names).size !== names.length) throw new PipelineStageError("character_generator", "同批人物姓名重复，请重试");
  // Remove draft values from the committed diff too (not merely the resulting state).
  // Reconstruct each newly generated entity with its final profile, retain unrelated changes.
  const finalPreview = applyPatches(preview.newWorld, additions);
  if (!finalPreview.success) throw new PipelineStageError("character_generator", finalPreview.error!);
  // Use a world diff to discard transient draft data and keep accurate transactional history.
  return diffWorld(world, finalPreview.newWorld);
}

import * as jsonpatch from "fast-json-patch";
function diffWorld(before: WorldState, after: WorldState): JsonPatchOperation[] {
  const compare = (jsonpatch as any).default?.compare || (jsonpatch as any).compare;
  return compare(before, after);
}
