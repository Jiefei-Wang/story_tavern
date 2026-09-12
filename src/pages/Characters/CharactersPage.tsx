import React from "react";
import { Users, Heart, Target, Brain, MapPin } from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";

export const CharactersPage: React.FC = () => {
  const { activeSave } = useGameStore();
  const entities = activeSave?.worldState?.entities || {};

  const characters = Object.entries(entities).filter(
    ([_, ent]) => ent.type === "character"
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <span>场景角色 (Characters)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          当前场景中活跃的实体角色及其各自的有限心智、目标、记忆与关系网。
        </p>
      </div>

      {/* Grid of Character Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {characters.map(([id, char]) => {
          const isPlayer = id === "player";
          const mood = char.mentalState?.mood || "normal";
          const relationship = char.relationships?.player ?? 0;

          return (
            <div
              key={id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 hover:border-blue-300 transition-all"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {char.name || id}
                  </h3>
                  <span className="font-mono text-[11px] text-slate-400">ID: {id}</span>
                </div>

                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isPlayer
                      ? "bg-blue-100 text-blue-800"
                      : mood === "alert"
                      ? "bg-amber-100 text-amber-800"
                      : mood === "suspicious"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {isPlayer ? "玩家" : `情绪: ${mood}`}
                </span>
              </div>

              {/* Location & Relationship */}
              <div className="space-y-2 text-xs pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>位置: </span>
                  <span className="font-medium text-slate-800">
                    {char.location || "未知"}
                  </span>
                </div>

                {!isPlayer && (
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span>对玩家好感度: </span>
                    <span className="font-bold text-slate-800">{relationship}</span>
                  </div>
                )}
              </div>

              {/* Goal */}
              {(char.appearance || char.occupation || char.background || char.personality) && (
                <div className="space-y-2 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {char.occupation && <p><strong>身份：</strong>{char.occupation}</p>}
                  {char.appearance && <p><strong>外貌：</strong>{char.appearance}</p>}
                  {char.background && <p><strong>个人背景：</strong>{char.background}</p>}
                  {char.personality && <p><strong>性格：</strong>{char.personality}</p>}
                </div>
              )}
              {char.goal && (
                <div className="space-y-1 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-blue-600" />
                    当前目标:
                  </span>
                  <p className="text-slate-600 leading-relaxed">{char.goal}</p>
                </div>
              )}

              {/* Memory */}
              {char.memory && (
                <div className="space-y-1 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5 text-purple-600" />
                    私密记忆 (有限视角):
                  </span>
                  <p className="text-slate-600 leading-relaxed">{char.memory}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
