import React, { useState, useRef } from "react";
import {
  CharacterFieldDefinition as Field,
  CharacterSchemaDefinition,
  GameSave,
} from "../../types";
import { validateCharacterSchemaDefinition } from "../../engine/character-schema/CharacterSchema";
import { useGameStore } from "../../stores/useGameStore";

const freshField = (id = "field"): Field => ({
  id,
  label: "新字段",
  type: "text",
  visibility: "private",
  updatePolicy: "dynamic",
  freedom: "guided",
});
const style = "border rounded px-2 py-1 w-full bg-white text-sm";
const freedoms = {
  strict: ["严格", "LLM 只能在明确约束内选择值。"],
  guided: ["引导", "结构严格，内容由模型根据描述决定。"],
  free: [
    "自由",
    "允许模型自由编写内容，但仍须符合字段外部结构。自由 ≠ arbitrary JSON。",
  ],
};

function JsonDefault({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(
    value === undefined ? "" : JSON.stringify(value),
  );
  const [error, setError] = useState("");
  return (
    <label>
      默认值（JSON，留空表示无默认值）
      <input
        className={style}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          try {
            onChange(t.trim() ? JSON.parse(t) : undefined);
            setError("");
            e.target.setCustomValidity("");
          } catch {
            setError("默认值 JSON 尚不完整，尚未采用");
            e.target.setCustomValidity("请先修正默认值 JSON");
          }
        }}
      />
      {error && (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
function FieldEditor({
  field: f,
  onChange,
}: {
  field: Field;
  onChange: (f: Field) => void;
}) {
  const update = (change: Partial<Field>) => onChange({ ...f, ...change });
  const numeric = f.type === "number" || f.type === "integer";
  return (
    <div className="border rounded p-3 space-y-3 bg-slate-50">
      <div className="grid md:grid-cols-3 gap-3">
        <label>
          字段 ID
          <input
            className={style}
            value={f.id}
            onChange={(e) => update({ id: e.target.value })}
          />
        </label>
        <label>
          显示名称
          <input
            className={style}
            value={f.label}
            onChange={(e) => update({ label: e.target.value })}
          />
        </label>
        <label>
          类型
          <select
            className={style}
            value={f.type}
            onChange={(e) => {
              const type = e.target.value as Field["type"];
              const {
                min,
                max,
                enumValues,
                item,
                fields,
                changePolicy,
                default: _default,
                ...common
              } = f;
              onChange({
                ...common,
                type,
                updatePolicy: "dynamic",
                ...(type === "enum" ? { enumValues: ["选项1"] } : {}),
                ...(type === "list" ? { item: freshField("item") } : {}),
                ...(type === "object" ? { fields: [] } : {}),
              });
            }}
          >
            {[
              "text",
              "number",
              "integer",
              "boolean",
              "enum",
              "list",
              "object",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          可见性
          <select
            className={style}
            value={f.visibility}
            onChange={(e) =>
              update({ visibility: e.target.value as Field["visibility"] })
            }
          >
            <option value="public">公开</option>
            <option value="private">仅本人可见</option>
          </select>
        </label>
        <label>
          更新策略
          <select
            className={style}
            value={f.updatePolicy}
            onChange={(e) =>
              update({
                updatePolicy: e.target.value as Field["updatePolicy"],
                changePolicy: undefined,
              })
            }
          >
            <option value="immutable">不可修改</option>
            <option value="setup_only">仅创建时设置</option>
            <option value="dynamic">动态修改</option>
            {["list", "text"].includes(f.type) && (
              <option value="append_only">仅追加</option>
            )}
          </select>
        </label>
        <label title={freedoms[f.freedom]?.[1]}>
          内容自由度
          <select
            className={style}
            value={f.freedom}
            onChange={(e) =>
              update({ freedom: e.target.value as Field["freedom"] })
            }
          >
            {Object.entries(freedoms).map(([key, v]) => (
              <option key={key} value={key}>
                {v[0]}
              </option>
            ))}
          </select>
          <small>{freedoms[f.freedom]?.[1]}</small>
        </label>
      </div>
      <label className="block">
        说明
        <textarea
          className={style}
          value={f.description || ""}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <label className="block">
        模型填写指导
        <textarea
          className={style}
          value={f.llmGuidance || ""}
          onChange={(e) => update({ llmGuidance: e.target.value })}
        />
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={!!f.required}
          onChange={(e) => update({ required: e.target.checked })}
        />{" "}
        必填
      </label>
      {f.type === "text" ? (
        <label className="block">
          默认文本
          <input
            className={style}
            value={typeof f.default === "string" ? f.default : ""}
            onChange={(e) => update({ default: e.target.value })}
          />
          <button onClick={() => update({ default: undefined })}>
            清除默认值
          </button>
        </label>
      ) : numeric ? (
        <label>
          默认值
          <input
            className={style}
            type="number"
            step={f.type === "integer" ? 1 : "any"}
            value={typeof f.default === "number" ? f.default : ""}
            onChange={(e) =>
              update({
                default:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      ) : f.type === "boolean" ? (
        <label>
          默认值
          <select
            className={style}
            value={f.default === undefined ? "" : String(f.default)}
            onChange={(e) =>
              update({
                default:
                  e.target.value === "" ? undefined : e.target.value === "true",
              })
            }
          >
            <option value="">无默认值</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </label>
      ) : f.type === "enum" ? (
        <>
          <label>
            枚举选项（每行一项）
            <textarea
              className={style}
              value={f.enumValues?.join("\n") || ""}
              onChange={(e) =>
                update({ enumValues: e.target.value.split("\n") })
              }
            />
          </label>
          <label>
            默认选项
            <select
              className={style}
              value={f.default === undefined ? "__none" : String(f.default)}
              onChange={(e) =>
                update({
                  default:
                    e.target.value === "__none" ? undefined : e.target.value,
                })
              }
            >
              <option value="__none">无默认值</option>
              {f.enumValues?.map((v, i) => (
                <option key={i} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <JsonDefault
          key={`${f.type}:${JSON.stringify(f.default)}`}
          value={f.default}
          onChange={(v) => update({ default: v })}
        />
      )}
      {numeric && (
        <div className="grid md:grid-cols-3 gap-2">
          {(["min", "max"] as const).map((key) => (
            <label key={key}>
              {key === "min" ? "最小值" : "最大值"}
              <input
                type="number"
                step="any"
                className={style}
                value={f[key] ?? ""}
                onChange={(e) =>
                  update({
                    [key]:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
          {f.updatePolicy === "dynamic" && (
            <>
              <label>
                变化模式
                <select
                  className={style}
                  value={f.changePolicy?.mode || ""}
                  onChange={(e) =>
                    update({
                      changePolicy: {
                        ...f.changePolicy,
                        mode: (e.target.value as "set" | "delta") || undefined,
                      },
                    })
                  }
                >
                  <option value="">set / delta 均可</option>
                  <option value="set">设定值</option>
                  <option value="delta">增减量</option>
                </select>
              </label>
              {(["maxPerEvent", "maxPerTurn"] as const).map((key) => (
                <label key={key}>
                  {key === "maxPerEvent"
                    ? "单事件最大变化（同一结算块累计）"
                    : "单回合最大累计变化"}
                  <input
                    className={style}
                    type="number"
                    min="0"
                    step="any"
                    value={f.changePolicy?.[key] ?? ""}
                    onChange={(e) =>
                      update({
                        changePolicy: {
                          ...f.changePolicy,
                          [key]:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </>
          )}
        </div>
      )}
      {f.type === "object" && (
        <FieldList
          fields={f.fields || []}
          onChange={(fields) => update({ fields })}
        />
      )}
      {f.type === "list" && (
        <div>
          <h4>列表项定义</h4>
          <FieldEditor
            field={f.item || freshField("item")}
            onChange={(item) => update({ item })}
          />
        </div>
      )}
    </div>
  );
}
function FieldList({
  fields,
  onChange,
}: {
  fields: Field[];
  onChange: (f: Field[]) => void;
}) {
  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={i}>
          <FieldEditor
            field={f}
            onChange={(next) =>
              onChange(fields.map((old, j) => (i === j ? next : old)))
            }
          />
          <button
            className="text-red-600 text-sm"
            onClick={() => onChange(fields.filter((_, j) => i !== j))}
          >
            删除字段
          </button>
        </div>
      ))}
      <button
        className="border rounded px-3 py-1"
        onClick={() => onChange([...fields, freshField(`field_${Date.now()}`)])}
      >
        添加字段
      </button>
    </div>
  );
}

export function SchemaEditor({ save }: { save: GameSave }) {
  const [draft, setDraft] = useState<CharacterSchemaDefinition>(() =>
    structuredClone(save.worldDefinition.characterSchema),
  );
  const [source, setSource] = useState(JSON.stringify(draft, null, 2));
  const root = useRef<HTMLDivElement>(null);
  const [sourceError, setSourceError] = useState(false);
  const [mode, setMode] = useState<"visual" | "source">("visual");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (s: CharacterSchemaDefinition) => {
    setDraft(s);
    setSource(JSON.stringify(s, null, 2));
    setError("");
    setSourceError(false);
    setMessage("");
  };
  const validation = validateCharacterSchemaDefinition(draft);
  const persist = async (newWorld: boolean) => {
    const invalid =
      root.current?.querySelector<HTMLInputElement>("input:invalid");
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await useGameStore.getState().saveCharacterSchema(draft, newWorld);
      setMessage(
        newWorld ? "已创建新世界，可在游戏中添加人物。" : "Schema 已保存。",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div ref={root} className="space-y-4">
      <p className="text-sm text-slate-600">
        Schema
        属于此存档。应用会检查当前人物及历史分支，补充默认值，不丢弃旧字段。若更换整套属性系统，请创建新世界。新世界玩家的必填字段需提供默认值。
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => setMode("visual")}
          disabled={sourceError && mode === "source"}
          className="border px-3 py-1 rounded"
        >
          Visual
        </button>
        <button
          onClick={() => setMode("source")}
          className="border px-3 py-1 rounded"
        >
          Source
        </button>
      </div>
      {mode === "source" ? (
        <label className="block">
          CharacterSchemaDefinition JSON
          <textarea
            aria-label="Schema Source"
            className={`${style} font-mono h-96`}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setMessage("");
              try {
                const parsed = JSON.parse(e.target.value);
                const check = validateCharacterSchemaDefinition(parsed);
                if (!check.valid) throw new Error(check.errors.join("\n"));
                setDraft(parsed);
                setError("");
                setSourceError(false);
              } catch (e) {
                setError(String(e));
                setSourceError(true);
              }
            }}
          />
        </label>
      ) : (
        <>
          {draft.sections.map((section, i) => (
            <section
              key={i}
              className="bg-white border rounded-xl p-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <label>
                  分组 ID
                  <input
                    className={style}
                    value={section.id}
                    onChange={(e) =>
                      change({
                        ...draft,
                        sections: draft.sections.map((s, j) =>
                          i === j ? { ...s, id: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  分组名称
                  <input
                    className={style}
                    value={section.label}
                    onChange={(e) =>
                      change({
                        ...draft,
                        sections: draft.sections.map((s, j) =>
                          i === j ? { ...s, label: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <div className="flex gap-3">
                {[-1, 1].map((direction) => (
                  <button
                    key={direction}
                    disabled={
                      i + direction < 0 ||
                      i + direction >= draft.sections.length
                    }
                    onClick={() => {
                      const sections = [...draft.sections];
                      [sections[i], sections[i + direction]] = [
                        sections[i + direction],
                        sections[i],
                      ];
                      change({ ...draft, sections });
                    }}
                  >
                    {direction === -1 ? "上移" : "下移"}
                  </button>
                ))}
                <button
                  className="text-red-600"
                  onClick={() =>
                    change({
                      ...draft,
                      sections: draft.sections.filter((_, j) => i !== j),
                    })
                  }
                >
                  删除分组
                </button>
              </div>
              <FieldList
                fields={section.fields}
                onChange={(fields) =>
                  change({
                    ...draft,
                    sections: draft.sections.map((s, j) =>
                      i === j ? { ...s, fields } : s,
                    ),
                  })
                }
              />
            </section>
          ))}
          <button
            className="border px-3 py-2 rounded"
            onClick={() =>
              change({
                ...draft,
                sections: [
                  ...draft.sections,
                  { id: `section_${Date.now()}`, label: "新分组", fields: [] },
                ],
              })
            }
          >
            添加分组
          </button>
          <section className="border bg-white rounded-xl p-4 space-y-3">
            <label>
              <input
                type="checkbox"
                checked={!!draft.relationship}
                onChange={(e) =>
                  change({
                    ...draft,
                    relationship: e.target.checked
                      ? { label: "关系", fields: [] }
                      : undefined,
                  })
                }
              />{" "}
              启用人物关系
            </label>
            {draft.relationship && (
              <>
                <label className="block">
                  关系名称
                  <input
                    className={style}
                    value={draft.relationship.label || ""}
                    onChange={(e) =>
                      change({
                        ...draft,
                        relationship: {
                          ...draft.relationship!,
                          label: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <FieldList
                  fields={draft.relationship.fields}
                  onChange={(fields) =>
                    change({
                      ...draft,
                      relationship: { ...draft.relationship!, fields },
                    })
                  }
                />
              </>
            )}
          </section>
        </>
      )}
      {(!validation.valid || error) && (
        <pre role="alert" className="text-red-700 whitespace-pre-wrap text-sm">
          {error || validation.errors.join("\n")}
        </pre>
      )}
      {message && (
        <p role="status" className="text-green-700">
          {message}
        </p>
      )}
      <div className="flex gap-3">
        <button
          className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
          disabled={
            busy || !validation.valid || (mode === "source" && sourceError)
          }
          onClick={() => persist(false)}
        >
          应用到此存档
        </button>
        <button
          className="border rounded px-4 py-2"
          disabled={
            busy || !validation.valid || (mode === "source" && sourceError)
          }
          onClick={() => persist(true)}
        >
          以此 Schema 创建新世界
        </button>
      </div>
    </div>
  );
}
