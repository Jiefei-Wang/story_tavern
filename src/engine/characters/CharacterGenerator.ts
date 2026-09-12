import { CharacterSchemaDefinition } from "../../types";
import { HARBOR_WORLD_DEFINITION } from "../character-schema/HarborSchema";
import { buildCharacterSchemaPrompt, characterFields, withAttributeDefaults, validateCharacterAgainstSchema } from "../character-schema/CharacterSchema";
import { AgentDefinition, JsonPatchOperation, WorldEntity, WorldState } from "../../types";
import { agentRuntime, RunAgentOptions } from "../runtime/AgentRuntime";
import { applyPatches } from "../world/PatchEngine";
import { PipelineStageError } from "../errors/PipelineStageError";

const shortText = { type: "string", minLength: 1, maxLength: 240 };
export const CHARACTER_GENERATOR: AgentDefinition = {
  id: "character_generator", name: "人物生成", version: "v1.0",
  description: "新增人物时根据精简环境和当前世界 Schema 独立生成姓名与属性；不读取主线或其他人物私密信息。",
  messages: [
    { id: "system", role: "system", content: `你是人物生成器。根据精简的公开环境和本次玩家要求，为即将登场的一位全新成年人生成合理人物。
输出符合世界日期与地点文化的真实人名，姓名使用中文或中文音译，职业、物品和生活经历符合该年代。禁止把“漂亮女孩”“陌生人”“商人”等类别或形容词直接当姓名。
仅当世界定义相应字段时，才生成该人物的个人经历、性格或日常目标。不知道主线剧情、幕后安排、其他人物秘密或玩家过去；禁止编造自己知晓这些内容，禁止建立与已有角色的旧关系。属性内容只来自该人物个人生活经历和当前公开环境。
人物应适应地点与时代氛围，同批次不同序号应有不同姓名和身份。玩家指定多人的情况下只生成当前序号对应的一位。
只输出 JSON：{name:真实姓名, attributes:符合当前世界定义的属性对象}。不要生成 relationships。创建时可设置 immutable/setup_only；有 default 的字段可以省略，其余 required 字段必须生成。` },
    { id: "user", role: "user", content: "精简环境：{{json environment}}\n玩家本次要求：{{request}}\n当前人物序号：{{ordinal}} / {{count}}\n人物属性定义：{{characterSchemaPrompt}}" },
  ],
  inputs: [
    { name: "environment", type: "object", description: "公开地点、天气与光照", required: true },
    { name: "request", type: "string", description: "玩家本次要求，不含历史或世界私密数据", required: true },
    { name: "ordinal", type: "number", description: "本批次人物序号", required: true },
    { name: "count", type: "number", description: "本批次人物数量", required: true },
  ],
  outputSchema: { type: "object", additionalProperties: false, properties: { name: { ...shortText, maxLength: 40 }, attributes: { type: "object" } }, required: ["name", "attributes"] },
  defaults: { temperature: 0.8, maxTokens: 0 },
};

/** Whitelist only. Do not pass scene.description, rules, draft NPC fields or existing NPCs. */
export function characterEnvironment(world: WorldState) {
  return { location: world.scene.location, weather: world.scene.weather, lighting: world.scene.lighting, time: world.clock };
}

interface Profile { name: string; attributes: Record<string, unknown> }

/** Preview the whole patch batch first, then replace newly introduced character drafts atomically.
 * Handles add/copy/replace and nested patches without allowing draft memories to survive. */
export async function generateNewCharacters(
  world: WorldState, patches: JsonPatchOperation[], request: string,
  options: Omit<RunAgentOptions, "agentId" | "context">,
  schema: CharacterSchemaDefinition = HARBOR_WORLD_DEFINITION.characterSchema,
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
      characterSchema: schema, characterSchemaPrompt: buildCharacterSchemaPrompt(schema, 'creation'),
    } });
    if (!result.success) throw new PipelineStageError("character_generator", result.error || "人物生成失败");
    const profile = result.data;
    if (!profile?.name?.trim() || /^(漂亮|美丽|美貌)?(女孩|少女|女人|男孩|男人|陌生人|商人)$/.test(profile.name.trim())) {
      throw new PipelineStageError("character_generator", "人物缺少真实姓名，请重试人物生成");
    }
    const entity: WorldEntity = {
      type: "character", name: profile.name.trim(),
      location: typeof draft.location === "string" ? draft.location : preview.newWorld.scene.location,
      attributes: withAttributeDefaults(profile.attributes || {}, characterFields(schema)),
      ...(schema.relationship ? { relationships: {} } : {}),
    };
    const validation = validateCharacterAgainstSchema(entity, schema, preview.newWorld);
    if (!validation.valid) throw new PipelineStageError("character_generator", validation.errors.join("; "));
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
