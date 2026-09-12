import React, { useState } from "react";
import {
  Layers,
  Plus,
  Copy,
  CheckCircle2,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import { AgentGroup, REASONING_EFFORT_OPTIONS, ReasoningEffort } from "../../types";
import { ExtraBodyEditor } from "./ExtraBodyEditor";
import { useAgentGroupStore } from "../../stores/useAgentGroupStore";
import { useAgentStore } from "../../stores/useAgentStore";
import { useBackendStore } from "../../stores/useBackendStore";

export const AgentGroupsPage: React.FC = () => {
  const {
    groups,
    activeGroupId,
    setActiveGroup,
    saveGroup,
    deleteGroup,
    duplicateGroup,
    updateBinding,
  } = useAgentGroupStore();
  const { agents } = useAgentStore();
  const { backends } = useBackendStore();

  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    activeGroupId || (groups.length > 0 ? groups[0].id : "")
  );
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];

  const handleCreateNew = async () => {
    const newGroup: AgentGroup = {
      id: `group_${Date.now()}`,
      name: "新 Agent 组合",
      description: "自定义 Agent 与模型的映射绑定",
      updatedAt: new Date().toISOString().split("T")[0],
      bindings: agents.map((a) => ({
        agentId: a.id,
        backendId: backends[0]?.id || "backend_openrouter",
        model: backends[0]?.models?.[0] || "nvidia/nemotron-3-super-120b-a12b:free",
      })),
    };
    await saveGroup(newGroup);
    setSelectedGroupId(newGroup.id);
  };

  const handleDuplicate = async (id: string) => {
    const dup = await duplicateGroup(id);
    if (dup) setSelectedGroupId(dup.id);
  };

  const handleDelete = async (id: string) => {
    if (groups.length <= 1) {
      alert("至少保留一个 Agent Group！");
      return;
    }
    if (confirm("确定要删除此 Agent Group 吗？")) {
      await deleteGroup(id);
      setSelectedGroupId(groups[0].id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span>Agent 组 (Agent Groups)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Agent Group 是一整套 Agent → Backend/Model 的 Binding 映射。切换 Group 可一键无感切换整个游戏引擎的模型路由配置。
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>新建组</span>
        </button>
      </div>

      {/* Group Switcher Tabs / Badges */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {groups.map((group) => {
          const isSelected = selectedGroup?.id === group.id;
          const isActive = activeGroupId === group.id;

          return (
            <div
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className={`px-4 py-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all flex items-center gap-2.5 shrink-0 ${
                isSelected
                  ? "bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20 text-slate-900"
                  : "bg-white/70 hover:bg-white border-slate-200 text-slate-600"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">{group.name}</span>
                {isActive && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                    当前生效
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Selected Group Details & Binding Table */}
      {selectedGroup && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-6">
          {/* Group Header & Actions */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={selectedGroup.name}
                  onChange={(e) =>
                    saveGroup({ ...selectedGroup, name: e.target.value })
                  }
                  className="font-bold text-base text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none px-1"
                />
                <span className="text-xs text-slate-400 font-mono">
                  ID: {selectedGroup.id}
                </span>
              </div>
              <input
                type="text"
                value={selectedGroup.description || ""}
                onChange={(e) =>
                  saveGroup({ ...selectedGroup, description: e.target.value })
                }
                placeholder="添加该组的描述……"
                className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none w-96 px-1"
              />
            </div>

            <div className="flex items-center gap-2">
              {activeGroupId !== selectedGroup.id ? (
                <button
                  onClick={() => setActiveGroup(selectedGroup.id)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>启用为此运行时配置 (Activate)</span>
                </button>
              ) : (
                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>当前正在运行</span>
                </span>
              )}

              <button
                onClick={() => handleDuplicate(selectedGroup.id)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                title="复制组"
              >
                <Copy className="w-3.5 h-3.5 inline mr-1" />
                复制
              </button>

              <button
                onClick={() => handleDelete(selectedGroup.id)}
                className="px-3 py-1.5 text-slate-400 hover:text-rose-600 rounded-lg text-xs transition-colors"
                title="删除组"
              >
                <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                删除
              </button>
            </div>
          </div>

          {/* Binding Configuration Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">Agent (智能体)</th>
                  <th className="py-3 px-4">Backend (API 服务端)</th>
                  <th className="py-3 px-4">Model (模型选择)</th>
                  <th className="py-3 px-4">参数覆盖 (Overrides)</th>
                  <th className="py-3 px-4 text-right">高级</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => {
                  const binding = selectedGroup.bindings.find(
                    (b) => b.agentId === agent.id
                  ) || {
                    agentId: agent.id,
                    backendId: backends[0]?.id || "backend_openrouter",
                    model: backends[0]?.models?.[0] || "nvidia/nemotron-3-super-120b-a12b:free",
                  };

                  const currentBackend =
                    backends.find((b) => b.id === binding.backendId) || backends[0];
                  const backendModels = currentBackend?.models || [];
                  const isExpanded = Boolean(expandedOverrides[agent.id]);

                  return (
                    <React.Fragment key={agent.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">
                            {agent.name}
                          </div>
                          <div className="font-mono text-[11px] text-blue-600">
                            {agent.id}
                          </div>
                        </td>

                        {/* Backend Dropdown */}
                        <td className="py-3 px-4">
                          <select
                            value={binding.backendId}
                            onChange={(e) => {
                              const newBackendId = e.target.value;
                              const b = backends.find((bk) => bk.id === newBackendId);
                              const firstModel = b?.models?.[0] || "nvidia/nemotron-3-super-120b-a12b:free";
                              updateBinding(selectedGroup.id, agent.id, {
                                backendId: newBackendId,
                                model: firstModel,
                              });
                            }}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 w-44"
                          >
                            {backends.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Model Dropdown / Input */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={binding.model}
                              onChange={(e) =>
                                updateBinding(selectedGroup.id, agent.id, {
                                  model: e.target.value,
                                })
                              }
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 outline-none focus:border-blue-500 w-52 truncate"
                            >
                              {backendModels.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                              {!backendModels.includes(binding.model) && (
                                <option value={binding.model}>{binding.model}</option>
                              )}
                            </select>

                            <input
                              type="text"
                              placeholder="自定义 Model ID"
                              value={binding.model}
                              onChange={(e) =>
                                updateBinding(selectedGroup.id, agent.id, {
                                  model: e.target.value,
                                })
                              }
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-700 outline-none focus:border-blue-500 w-36"
                              title="手动输入 Model ID"
                            />
                          </div>
                        </td>

                        {/* Overrides summary */}
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {binding.overrides?.temperature !== undefined &&
                            `Temp: ${binding.overrides.temperature} `}
                          {binding.overrides?.maxTokens !== undefined &&
                            `Tokens: ${binding.overrides.maxTokens === 0 ? "无上限" : binding.overrides.maxTokens}`}
                          {binding.overrides?.temperature === undefined &&
                            binding.overrides?.maxTokens === undefined &&
                            "使用默认"}
                          <div>思维: {binding.overrides?.reasoningEffort ?? "none"}</div>
                          {Object.keys(binding.overrides?.extraBody ?? {}).length > 0 && <div>extraBody: {Object.keys(binding.overrides!.extraBody!).length} 个字段（优先）</div>}
                        </td>

                        {/* Expand Button */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() =>
                              setExpandedOverrides({
                                ...expandedOverrides,
                                [agent.id]: !isExpanded,
                              })
                            }
                            className="px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded text-xs flex items-center gap-1 ml-auto"
                          >
                            <span>覆盖参数</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Overrides Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="py-3 px-6">
                            <div className="flex flex-wrap items-center gap-6 text-xs">
                              <label className="flex items-center gap-2 text-slate-600 font-medium">
                                思维强度
                                <select aria-label={`${agent.name} 思维强度`}
                                  value={binding.overrides?.reasoningEffort ?? "none"}
                                  onChange={(e) => updateBinding(selectedGroup.id, agent.id, {
                                    overrides: { reasoningEffort: e.target.value as ReasoningEffort },
                                  })}
                                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs">
                                  {REASONING_EFFORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.value})</option>)}
                                </select>
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 font-medium">
                                  Temperature:
                                </span>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0}
                                  max={2}
                                  value={binding.overrides?.temperature ?? ""}
                                  placeholder={String(agent.defaults.temperature ?? 0.7)}
                                  onChange={(e) =>
                                    updateBinding(selectedGroup.id, agent.id, {
                                      overrides: {
                                        temperature: e.target.value
                                          ? parseFloat(e.target.value)
                                          : undefined,
                                      },
                                    })
                                  }
                                  className="w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 font-medium">
                                  Max Tokens (0 = 无上限):
                                </span>
                                <input
                                  type="number"
                                  step={100}
                                  min={0}
                                  value={binding.overrides?.maxTokens ?? ""}
                                  placeholder={String(agent.defaults.maxTokens ?? 0)}
                                  onChange={(e) =>
                                    updateBinding(selectedGroup.id, agent.id, {
                                      overrides: {
                                        maxTokens: e.target.value
                                          ? parseInt(e.target.value)
                                          : undefined,
                                      },
                                    })
                                  }
                                  className="w-24 bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                />
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">默认发送 reasoning_effort: none。所有档位均可选择并原样发送，是否支持由后端决定，不自动降级。后端使用其他字段时可在 extraBody 中配置。</p>
                            <ExtraBodyEditor key={`${selectedGroup.id}:${agent.id}`}
                              value={binding.overrides?.extraBody}
                              onSave={(extraBody) => updateBinding(selectedGroup.id, agent.id, { overrides: { extraBody } })} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
