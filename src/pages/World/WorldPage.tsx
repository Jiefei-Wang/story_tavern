import React from "react";
import { Globe2, Clock, Sun, Cloud, Shield, Box } from "lucide-react";
import { useGameStore } from "../../stores/useGameStore";
import { JsonViewer } from "../../components/Common/JsonViewer";

export const WorldPage: React.FC = () => {
  const { activeSave } = useGameStore();
  const world = activeSave?.worldState;

  if (!world) {
    return <div className="p-10 text-center text-slate-400 text-xs">暂无活跃世界数据</div>;
  }

  const objects = Object.entries(world.entities || {}).filter(
    ([_, ent]) => ent.type === "object"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-blue-600" />
          <span>世界与法则 (World & Rules)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          当前世界的时钟、场景环境特征、场景中物体实体状态与底层魔法/法则设定。
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Time & Clock */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>世界时钟 (Clock)</span>
          </div>
          <div className="font-mono text-lg font-bold text-slate-900">
            {world.clock}
          </div>
        </div>

        {/* Lighting */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Sun className="w-4 h-4 text-amber-500" />
            <span>环境光照 (Lighting)</span>
          </div>
          <div className="font-bold text-lg text-slate-900 capitalize">
            {world.scene.lighting}
          </div>
        </div>

        {/* Weather */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Cloud className="w-4 h-4 text-sky-500" />
            <span>天气气候 (Weather)</span>
          </div>
          <div className="font-bold text-lg text-slate-900 capitalize">
            {world.scene.weather}
          </div>
        </div>
      </div>

      {/* World Objects & Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Objects */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Box className="w-4 h-4 text-blue-600" />
            <span>场景道具与对象 (Objects)</span>
          </div>

          <div className="space-y-2 text-xs">
            {objects.map(([id, obj]) => (
              <div
                key={id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-slate-800">{obj.name || id}</span>
                  <span className="text-[11px] text-slate-400 font-mono ml-2">({id})</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {obj.open !== undefined && (
                    <span className="bg-white border px-2 py-0.5 rounded">
                      状态: {obj.open ? "打开" : "关闭"}
                    </span>
                  )}
                  {obj.locked !== undefined && (
                    <span className="bg-white border px-2 py-0.5 rounded">
                      {obj.locked ? "已上锁" : "未上锁"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rules */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Shield className="w-4 h-4 text-purple-600" />
            <span>世界底层法则 (Rules)</span>
          </div>
          <p className="text-xs text-slate-500">
            可通过管理员指令（Admin Patch）修改以下规则法则。
          </p>
          <JsonViewer data={world.rules} />
        </div>
      </div>
    </div>
  );
};
