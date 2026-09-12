import React, { useState } from "react";
import { useGameStore } from "../../stores/useGameStore";
import { CharacterFields } from "./CharacterFields";
import { SchemaEditor } from "./SchemaEditor";

export const CharactersPage: React.FC = () => {
  const { activeSave, isExecuting } = useGameStore();
  const [editing, setEditing] = useState(false);
  if (!activeSave) return <p>请先创建或选择存档。</p>;
  const schema = activeSave.worldDefinition.characterSchema;
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-xl font-bold">人物 · {activeSave.name}</h1>
          <p className="text-sm text-slate-500">
            作者视图：包含人物私密属性。各 Agent 仍仅获得其权限内的信息。
          </p>
        </div>
        <button
          className="px-3 py-2 border rounded"
          disabled={isExecuting}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "返回人物" : "编辑世界人物 Schema"}
        </button>
      </div>
      {editing ? (
        <SchemaEditor key={activeSave.id} save={activeSave} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(activeSave.worldState.entities)
            .filter(([, e]) => e.type === "character")
            .map(([id, entity]) => (
              <article
                key={id}
                className="rounded-xl border bg-white p-5 space-y-4"
              >
                <header>
                  <h2 className="font-bold">
                    {entity.name || id}
                    {id === "player" ? " · 玩家" : ""}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {id} · {entity.location || "位置未知"}
                  </p>
                </header>
                {schema.sections.map((section) => (
                  <section key={section.id} className="border-t pt-3">
                    <h3 className="font-semibold mb-2">{section.label}</h3>
                    <CharacterFields
                      fields={section.fields}
                      values={entity.attributes || {}}
                    />
                  </section>
                ))}
                {schema.relationship && (
                  <section className="border-t pt-3">
                    <h3 className="font-semibold">
                      {schema.relationship.label || "关系"}
                    </h3>
                    {Object.entries(entity.relationships || {}).map(
                      ([target, values]) => (
                        <div key={target} className="mt-2">
                          <h4>
                            {activeSave.worldState.entities[target]?.name ||
                              target}
                          </h4>
                          <CharacterFields
                            fields={schema.relationship!.fields}
                            values={values}
                          />
                        </div>
                      ),
                    )}
                  </section>
                )}
              </article>
            ))}
        </div>
      )}
    </div>
  );
};
