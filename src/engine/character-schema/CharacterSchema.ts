import {
  CharacterFieldDefinition as Field,
  CharacterSchemaDefinition as Definition,
  WorldEntity,
  WorldState,
  CharacterStateUpdate,
} from "../../types";
import { SchemaValidator } from "../schema/SchemaValidator";

const hasOwn = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);
export const safeId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(id) &&
  !["__proto__", "prototype", "constructor"].includes(id.toLowerCase());
export const characterFields = (s: Definition) =>
  s.sections.flatMap((section) => section.fields);
const equal = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  if (object(a) && object(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((k) => hasOwn(b, k) && equal(a[k], b[k]))
    );
  return false;
};
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const clone = <T>(v: T): T =>
  v === undefined ? v : JSON.parse(JSON.stringify(v));
function isJsonData(
  value: unknown,
  seen = new Set<unknown>(),
  depth = 0,
): boolean {
  if (depth > 32) return false;
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean"
  )
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  seen.add(value);
  const valid = Object.values(value).every((v) =>
    isJsonData(v, seen, depth + 1),
  );
  seen.delete(value);
  return valid;
}

export function fieldJsonSchema(f: Field): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type:
      (
        { text: "string", enum: "string", list: "array" } as Record<
          string,
          string
        >
      )[f.type] || f.type,
  };
  if (f.type === "enum") schema.enum = f.enumValues;
  if (f.type === "number" || f.type === "integer") {
    if (f.min !== undefined) schema.minimum = f.min;
    if (f.max !== undefined) schema.maximum = f.max;
  }
  if (f.type === "list") schema.items = fieldJsonSchema(f.item!);
  if (f.type === "object") Object.assign(schema, fieldsJsonSchema(f.fields!));
  return schema;
}
export function fieldsJsonSchema(fields: Field[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      fields.map((f) => [f.id, fieldJsonSchema(f)]),
    ),
    required: fields.filter((f) => f.required).map((f) => f.id),
  };
}

/** Validate the small authoring language before recursively compiling it. Never eval/compile code. */
export function validateCharacterSchemaDefinition(value: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const fail = (path: string, why: string) => errors.push(`${path}: ${why}`);
  const seen = new Set<unknown>();
  let count = 0;
  const visit = (fields: unknown, path: string, depth: number) => {
    if (depth > 8) {
      fail(path, "嵌套不能超过 8 层");
      return;
    }
    if (!Array.isArray(fields)) {
      fail(path, "必须是字段数组");
      return;
    }
    const ids = new Set<string>();
    for (const raw of fields) {
      if (++count > 256) {
        fail(path, "字段总数不能超过 256");
        return;
      }
      if (!object(raw)) {
        fail(path, "字段必须是对象");
        continue;
      }
      if (seen.has(raw)) {
        fail(path, "循环或重复引用定义");
        continue;
      }
      seen.add(raw);
      const f = raw as unknown as Field;
      const p = `${path}.${f.id}`;
      if (!safeId(f.id))
        fail(p, "ID 只允许字母、数字、下划线、短横线，不能使用保留名");
      if (ids.has(f.id)) fail(p, "重复字段 ID");
      ids.add(f.id);
      if (typeof f.label !== "string" || !f.label.trim()) fail(p, "请填写名称");
      const keys = [
        "id",
        "label",
        "type",
        "description",
        "llmGuidance",
        "default",
        "visibility",
        "updatePolicy",
        "freedom",
        "required",
        "min",
        "max",
        "enumValues",
        "item",
        "fields",
        "changePolicy",
      ];
      for (const key of Object.keys(raw))
        if (!keys.includes(key)) fail(p, `不支持配置 ${key}`);
      if (
        ![
          "text",
          "number",
          "integer",
          "boolean",
          "enum",
          "list",
          "object",
        ].includes(f.type)
      )
        fail(p, "未知字段类型");
      if (!["public", "private"].includes(f.visibility))
        fail(p, "请选择公开或私密");
      if (
        !["immutable", "setup_only", "dynamic", "append_only"].includes(
          f.updatePolicy,
        )
      )
        fail(p, "未知更新策略");
      if (!["strict", "guided", "free"].includes(f.freedom))
        fail(p, "未知内容自由度");
      for (const key of ["description", "llmGuidance"] as const)
        if (f[key] !== undefined && typeof f[key] !== "string")
          fail(p, `${key} 必须是文本`);
      if (f.required !== undefined && typeof f.required !== "boolean")
        fail(p, "required 必须是布尔值");
      const numeric = f.type === "number" || f.type === "integer";
      for (const key of ["min", "max"] as const)
        if (f[key] !== undefined && (!numeric || !Number.isFinite(f[key])))
          fail(p, `${key} 仅支持有限数值字段`);
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        fail(p, "最小值不能大于最大值");
      if (
        f.type === "integer" &&
        f.min !== undefined &&
        f.max !== undefined &&
        Math.ceil(f.min) > Math.floor(f.max)
      )
        fail(p, "范围内没有整数");
      if (
        f.type === "enum" &&
        (!Array.isArray(f.enumValues) ||
          !f.enumValues.length ||
          f.enumValues.some((v) => typeof v !== "string") ||
          new Set(f.enumValues).size !== f.enumValues.length)
      )
        fail(p, "枚举需要不重复的文本选项");
      if (f.enumValues !== undefined && f.type !== "enum")
        fail(p, "只有 enum 可设置选项");
      if (
        f.updatePolicy === "append_only" &&
        !["list", "text"].includes(f.type)
      )
        fail(p, "append_only 仅支持列表或文本");
      if (f.changePolicy !== undefined) {
        if (!numeric || !object(f.changePolicy) || f.updatePolicy !== "dynamic")
          fail(p, "changePolicy 仅支持 dynamic 数值");
        else {
          for (const key of Object.keys(f.changePolicy))
            if (!["mode", "maxPerEvent", "maxPerTurn"].includes(key))
              fail(p, `未知变化规则 ${key}`);
          if (
            f.changePolicy.mode !== undefined &&
            !["set", "delta"].includes(f.changePolicy.mode)
          )
            fail(p, "未知变化模式");
          for (const key of ["maxPerEvent", "maxPerTurn"] as const)
            if (
              f.changePolicy[key] !== undefined &&
              (!Number.isFinite(f.changePolicy[key]) ||
                f.changePolicy[key]! < 0)
            )
              fail(p, `${key} 必须是非负有限数值`);
        }
      }
      const beforeChildren = errors.length;
      if (f.type === "list")
        visit(f.item ? [f.item] : undefined, `${p}[]`, depth + 1);
      else if (f.item !== undefined) fail(p, "只有 list 可配置 item");
      if (f.type === "object") visit(f.fields, p, depth + 1);
      else if (f.fields !== undefined) fail(p, "只有 object 可配置 fields");
      if (f.default !== undefined && errors.length === beforeChildren) {
        if (!isJsonData(f.default)) {
          fail(p, "默认值必须是有限、无循环的 JSON 数据");
          continue;
        }
        try {
          const result = SchemaValidator.validate(
            fieldJsonSchema(f),
            f.default,
          );
          if (!result.valid) fail(p, `默认值无效：${result.errors}`);
        } catch {
          fail(p, "默认值或字段结构无法编译");
        }
      }
    }
  };
  if (!object(value) || value.version !== 1 || !Array.isArray(value.sections))
    return {
      valid: false,
      errors: ["Schema 必须有 version: 1 和 sections 数组"],
    };
  for (const key of Object.keys(value))
    if (!["version", "sections", "relationship"].includes(key))
      fail("Schema", `未知配置 ${key}`);
  const sectionIds = new Set<string>();
  const all: unknown[] = [];
  for (const section of value.sections) {
    if (
      !object(section) ||
      !safeId(section.id) ||
      typeof section.label !== "string" ||
      !section.label.trim()
    ) {
      fail("section", "分组需要合法 ID 和名称");
      continue;
    }
    if (sectionIds.has(section.id)) fail(section.id, "重复分组 ID");
    sectionIds.add(section.id);
    for (const key of Object.keys(section))
      if (!["id", "label", "fields"].includes(key))
        fail(section.id, `未知配置 ${key}`);
    if (!Array.isArray(section.fields)) fail(section.id, "需要 fields 数组");
    else all.push(...section.fields);
  }
  visit(all, "attributes", 0);
  if (value.relationship !== undefined) {
    if (!object(value.relationship)) fail("relationship", "需要对象");
    else {
      for (const key of Object.keys(value.relationship))
        if (!["label", "fields"].includes(key))
          fail("relationship", `未知配置 ${key}`);
      if (
        value.relationship.label !== undefined &&
        typeof value.relationship.label !== "string"
      )
        fail("relationship", "label 必须是文本");
      visit(value.relationship.fields, "relationships.<target>", 0);
    }
  }
  return { valid: !errors.length, errors };
}
export function assertCharacterSchema(s: Definition): void {
  const result = validateCharacterSchemaDefinition(s);
  if (!result.valid) throw new Error(result.errors.join("\n"));
}
export function buildCharacterJsonSchema(
  s: Definition,
): Record<string, unknown> {
  assertCharacterSchema(s);
  return {
    type: "object",
    additionalProperties: false,
    required: ["type"],
    properties: {
      type: { const: "character" },
      name: { type: "string" },
      location: { type: "string" },
      attributes: fieldsJsonSchema(characterFields(s)),
      ...(s.relationship
        ? {
            relationships: {
              type: "object",
              propertyNames: { pattern: "^[A-Za-z_][A-Za-z0-9_-]{0,63}$" },
              additionalProperties: fieldsJsonSchema(s.relationship.fields),
            },
          }
        : {}),
    },
    ...(characterFields(s).some((f) => f.required)
      ? { required: ["type", "attributes"] }
      : {}),
  };
}
export function validateCharacterAgainstSchema(
  entity: WorldEntity,
  s: Definition,
  world?: WorldState,
): { valid: boolean; errors: string[] } {
  if (!isJsonData(entity))
    return { valid: false, errors: ["人物值必须是有限、无循环的 JSON 数据"] };
  const result = SchemaValidator.validate(buildCharacterJsonSchema(s), entity);
  const errors = result.valid ? [] : [result.errors || "人物结构无效"];
  for (const target of Object.keys(entity.relationships || {}))
    if (
      !safeId(target) ||
      (world &&
        (!hasOwn(world.entities, target) ||
          world.entities[target].type !== "character"))
    )
      errors.push(`relationships.${target}: 目标人物不存在或 ID 不合法`);
  return { valid: !errors.length, errors };
}

export function defaultFields(fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((f) => {
      const value =
        f.default !== undefined
          ? clone(f.default)
          : f.type === "object"
            ? defaultFields(f.fields!)
            : undefined;
      return value !== undefined &&
        (f.type !== "object" ||
          f.required ||
          Object.keys(value as object).length)
        ? [[f.id, value]]
        : [];
    }),
  );
}
export const createDefaultCharacterAttributes = (s: Definition) =>
  defaultFields(characterFields(s));
export function withAttributeDefaults(
  attributes: Record<string, unknown>,
  fields: Field[],
): Record<string, unknown> {
  const result = { ...defaultFields(fields), ...clone(attributes) };
  const enrich = (value: unknown, f: Field): unknown =>
    f.type === "object" && object(value)
      ? withAttributeDefaults(value, f.fields!)
      : f.type === "list" && Array.isArray(value)
        ? value.map((v) => enrich(v, f.item!))
        : value;
  for (const f of fields)
    if (result[f.id] !== undefined) result[f.id] = enrich(result[f.id], f);
  return result;
}

/** A private parent hides its entire subtree. Lists retain shape and recursively redact entries. */
function project(
  fields: Field[],
  values: Record<string, unknown>,
  visibility: "public" | "private",
  inheritedPrivate = false,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    const value = values[f.id];
    if (value === undefined) continue;
    const privateHere = inheritedPrivate || f.visibility === "private";
    if (privateHere) {
      if (visibility === "private") result[f.id] = clone(value);
      continue;
    }
    if (f.type === "object") {
      const child = project(
        f.fields!,
        value as Record<string, unknown>,
        visibility,
      );
      if (Object.keys(child).length) result[f.id] = child;
    } else if (f.type === "list") {
      const entries = (value as unknown[])
        .map(
          (v) =>
            project([f.item!], { [f.item!.id]: v }, visibility)[f.item!.id],
        )
        .filter((v) => v !== undefined);
      if (
        entries.length ||
        (visibility === "public" && f.item!.visibility === "public")
      )
        result[f.id] = entries;
    } else if (visibility === "public") result[f.id] = clone(value);
  }
  return result;
}
function projectCharacter(
  entity: WorldEntity,
  s: Definition,
  visibility: "public" | "private",
) {
  const attributes = project(
    characterFields(s),
    entity.attributes || {},
    visibility,
  );
  const relationships = s.relationship
    ? Object.fromEntries(
        Object.entries(entity.relationships || {}).flatMap(
          ([target, values]) => {
            const filtered = project(
              s.relationship!.fields,
              values,
              visibility,
            );
            return Object.keys(filtered).length ? [[target, filtered]] : [];
          },
        ),
      )
    : {};
  return {
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(Object.keys(relationships).length ? { relationships } : {}),
  };
}
export const getPublicCharacterFields = (e: WorldEntity, s: Definition) =>
  projectCharacter(e, s, "public");
export const getPrivateCharacterFields = (e: WorldEntity, s: Definition) =>
  projectCharacter(e, s, "private");

export function buildCharacterSchemaPrompt(
  s: Definition,
  purpose: "runtime" | "creation" = "runtime",
): string {
  assertCharacterSchema(s);
  const lines =
    purpose === "creation"
      ? [
          '人物创建协议：只输出 {"name":"真实姓名","attributes":{}}。attributes 只能包含下列已定义字段，禁止额外外貌、性格、目标等未定义字段。',
          "创建时可初始化 immutable/setup_only/dynamic/append_only 字段。有 default 的字段可省略，由程序补齐；无 default 的 required 字段必须生成。",
          "不要输出 relationships 或 stateUpdates，不要在 attributes 内嵌 relationships。程序初始化关系。自由内容仍须符合字段类型及容器结构。",
        ]
      : [
          "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。",
          "stateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。",
          "immutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。",
        ];
  const emit = (f: Field, path: string) => {
    lines.push(
      `${path}（${f.label}）: ${f.type}; ${f.visibility}; ${f.updatePolicy}; ${f.freedom}; ${f.required ? "必填" : "可选"}${f.min !== undefined ? `; min=${f.min}` : ""}${f.max !== undefined ? `; max=${f.max}` : ""}${f.enumValues ? `; enum=${f.enumValues.join("|")}` : ""}${f.default !== undefined ? `; default=${JSON.stringify(f.default)}` : ""}${
        f.changePolicy
          ? `; ${Object.entries(f.changePolicy)
              .map(([k, v]) => `${k}=${v}`)
              .join("; ")}`
          : ""
      }${f.description ? `; 说明：${f.description}` : ""}${f.llmGuidance ? `; 指导：${f.llmGuidance}` : ""}`,
    );
    if (f.fields)
      f.fields.forEach((child) => emit(child, `${path}.${child.id}`));
    if (f.item) {
      lines.push(
        `${path} 的列表项直接符合以下结构，不额外包装 item/entry 键。${purpose === "runtime" ? "append.value 直接是单个列表项，不包含数组外壳。" : ""}`,
      );
      emit(f.item, `${path}[]`);
    }
  };
  const walk = (fields: Field[], prefix: string) =>
    fields.forEach((f) => emit(f, `${prefix}.${f.id}`));
  walk(characterFields(s), "attributes");
  if (purpose === "runtime") {
    if (s.relationship)
      walk(s.relationship.fields, "relationships.<现有人物ID>");
    else lines.push("此世界没有 relationship，禁止创建 relationships。");
  }
  return lines.join("\n");
}

export type ChangeLedger = Record<string, number>;
/** Compare every nested field, including whole-object replacements. Cumulative absolute travel prevents oscillation exploits. */
export function validateCharacterTransition(
  before: WorldEntity,
  after: WorldEntity,
  s: Definition,
  id: string,
  turn: ChangeLedger,
  event: ChangeLedger,
): string[] {
  const errors: string[] = [];
  const walk = (
    fields: Field[],
    a: Record<string, any>,
    b: Record<string, any>,
    prefix: string,
  ) => {
    for (const f of fields) {
      const old = a[f.id],
        next = b[f.id],
        path = `${prefix}.${f.id}`;
      if (equal(old, next)) continue;
      if (f.updatePolicy === "immutable" || f.updatePolicy === "setup_only") {
        errors.push(`${path}: ${f.updatePolicy}`);
        continue;
      }
      if (f.updatePolicy === "append_only") {
        const valid =
          f.type === "text"
            ? typeof next === "string" && next.startsWith(old ?? "")
            : Array.isArray(next) &&
              (old === undefined ||
                (Array.isArray(old) &&
                  next.length >= old.length &&
                  old.every((v, i) => equal(v, next[i]))));
        if (!valid) errors.push(`${path}: append_only，不可替换或删除历史`);
      }
      if (f.type === "object")
        walk(f.fields!, object(old) ? old : {}, object(next) ? next : {}, path);
      if (f.type === "list" && Array.isArray(old))
        for (let i = 0; i < old.length; i++)
          walk(
            [f.item!],
            { [f.item!.id]: old[i] },
            { [f.item!.id]: Array.isArray(next) ? next[i] : undefined },
            `${path}[${i}]`,
          );
      if (f.type === "number" || f.type === "integer") {
        const baseline = old ?? f.default;
        if (
          f.changePolicy &&
          (typeof baseline !== "number" || typeof next !== "number")
        ) {
          errors.push(`${path}: bounded 数值更新需要现值/default，不可删除`);
          continue;
        }
        if (typeof baseline === "number" && typeof next === "number") {
          const key = `${id}.${path}`;
          const amount = Math.abs(next - baseline);
          event[key] = (event[key] || 0) + amount;
          turn[key] = (turn[key] || 0) + amount;
          if (
            f.changePolicy?.maxPerEvent !== undefined &&
            event[key] > f.changePolicy.maxPerEvent + 1e-10
          )
            errors.push(
              `${path}: maxPerEvent=${f.changePolicy.maxPerEvent}, proposed=${event[key]}`,
            );
          if (
            f.changePolicy?.maxPerTurn !== undefined &&
            turn[key] > f.changePolicy.maxPerTurn + 1e-10
          )
            errors.push(
              `${path}: maxPerTurn=${f.changePolicy.maxPerTurn}, proposed=${turn[key]}`,
            );
        }
      }
    }
  };
  walk(
    characterFields(s),
    before.attributes || {},
    after.attributes || {},
    "attributes",
  );
  if (s.relationship)
    for (const target of new Set([
      ...Object.keys(before.relationships || {}),
      ...Object.keys(after.relationships || {}),
    ]))
      walk(
        s.relationship.fields,
        before.relationships?.[target] || {},
        after.relationships?.[target] || {},
        `relationships.${target}`,
      );
  return errors;
}

export function validateCharacterUpdate(
  entity: WorldEntity,
  update: CharacterStateUpdate,
  s: Definition,
  world: WorldState,
  id = "self",
  turn: ChangeLedger = {},
  event: ChangeLedger = {},
) {
  const reject = (reason: string) => ({
    valid: false,
    errors: [reason],
    before: clone(entity),
    after: clone(entity),
  });
  if (
    !object(update) ||
    typeof update.path !== "string" ||
    !["set", "delta", "append"].includes(update.op) ||
    !hasOwn(update, "value") ||
    Object.keys(update).some(
      (k) => !["path", "op", "value", "reason", "sourceEventIds"].includes(k),
    ) ||
    (update.reason !== undefined && typeof update.reason !== "string") ||
    (update.sourceEventIds !== undefined && (!Array.isArray(update.sourceEventIds) || update.sourceEventIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(update.sourceEventIds).size !== update.sourceEventIds.length))
  )
    return reject("stateUpdates: 无效的提议结构");
  if (update.value === undefined || !isJsonData(update.value))
    return reject("stateUpdates.value: 必须是有限、无循环的 JSON 数据");
  const tokens = update.path.split(".");
  if (tokens.some((t) => !safeId(t))) return reject("path: 非法字段路径");
  let fields = characterFields(s);
  let offset = 1;
  const after = clone(entity);
  if (tokens[0] === "relationships") {
    if (
      !s.relationship ||
      !hasOwn(world.entities, tokens[1]) ||
      world.entities[tokens[1]].type !== "character"
    )
      return reject("relationship: 未定义或目标人物不存在");
    fields = s.relationship.fields;
    offset = 2;
    after.relationships ??= {};
    after.relationships[tokens[1]] ??= defaultFields(fields);
  } else if (tokens[0] !== "attributes")
    return reject("path: 只能修改自己 attributes 或 relationships");
  after.attributes ??= {};
  let container: Record<string, any> =
    offset === 1 ? after.attributes : after.relationships![tokens[1]];
  let field: Field | undefined;
  for (let i = offset; i < tokens.length; i++) {
    field = fields.find((f) => f.id === tokens[i]);
    if (!field) return reject(`${update.path}: 字段不存在`);
    if (["immutable", "setup_only"].includes(field.updatePolicy))
      return reject(`${update.path}: ${field.updatePolicy}`);
    if (i < tokens.length - 1) {
      if (field.type !== "object")
        return reject("path: 只能沿 object 字段定位，列表通过 append 更新");
      container = container[field.id] ??= defaultFields(field.fields!);
      fields = field.fields!;
    }
  }
  if (!field) return reject("path: 缺少字段");
  const old = container[field.id] ?? field.default;
  if (update.op === "delta") {
    if (
      !["number", "integer"].includes(field.type) ||
      field.changePolicy?.mode === "set" ||
      typeof update.value !== "number" ||
      !Number.isFinite(update.value) ||
      typeof old !== "number"
    )
      return reject("delta: 仅允许有现值的数值字段且不能为 mode=set");
    container[field.id] = old + update.value;
  } else if (update.op === "append") {
    if (field.type === "list")
      container[field.id] = [
        ...((old as unknown[]) || []),
        clone(update.value),
      ];
    else if (field.type === "text" && typeof update.value === "string")
      container[field.id] = (old || "") + update.value;
    else return reject("append: 仅支持列表项或文本");
  } else {
    if (
      field.updatePolicy === "append_only" ||
      field.changePolicy?.mode === "delta"
    )
      return reject(
        `${update.path}: 必须使用 ${field.updatePolicy === "append_only" ? "append" : "delta"}`,
      );
    container[field.id] = clone(update.value);
  }
  const nextTurn = { ...turn },
    nextEvent = { ...event };
  const errors = [
    ...validateCharacterAgainstSchema(after, s, world).errors,
    ...validateCharacterTransition(entity, after, s, id, nextTurn, nextEvent),
  ];
  if (errors.length) return reject(errors.join("; "));
  Object.assign(turn, nextTurn);
  Object.assign(event, nextEvent);
  return { valid: true, errors: [], before: clone(entity), after };
}

/** Deterministic fixture generation for MockSimulator only, never a live fallback. */
export function sampleFields(fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [
      f.id,
      f.default !== undefined
        ? clone(f.default)
        : f.type === "object"
          ? sampleFields(f.fields!)
          : f.type === "list"
            ? []
            : f.type === "boolean"
              ? false
              : f.type === "enum"
                ? f.enumValues![0]
                : f.type === "number" || f.type === "integer"
                  ? f.type === "integer"
                    ? Math.ceil(f.min ?? Math.min(0, f.max ?? 0))
                    : (f.min ?? Math.min(0, f.max ?? 0))
                  : `示例${f.label}`,
    ]),
  );
}
