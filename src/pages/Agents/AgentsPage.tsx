import React from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Plus, Copy, Edit2, Trash2, Tag, Calendar } from "lucide-react";
import { useAgentStore } from "../../stores/useAgentStore";
import { useAgentGroupStore } from "../../stores/useAgentGroupStore";

export const AgentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { agents, duplicateAgent, deleteAgent, resetBuiltinAgents } = useAgentStore();
  const { groups } = useAgentGroupStore();

  const handleEdit = (id: string) => {
    navigate(`/agents/${id}`);
  };

  const handleDuplicate = async (id: string) => {
    const dup = await duplicateAgent(id);
    if (dup) {
      navigate(`/agents/${dup.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    const referencingGroups = groups.filter((g) =>
      g.bindings.some((b) => b.agentId === id)
    );

    if (referencingGroups.length > 0) {
      const details = referencingGroups
        .map((g) => `· 分组 [${g.name}]`)
        .join("\n");
      alert(
        `无法删除该 Agent：当前仍有 ${referencingGroups.length} 个智能体分组绑定引用了此 Agent！\n\n${details}\n\n请先从相关分组中移除此 Agent 绑定后再尝试删除。`
      );
      return;
    }

    if (confirm("确定要删除此 Agent 吗？")) {
      await deleteAgent(id);
    }
  };

  const handleCreate = () => {
    navigate("/agents/new");
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <span>Agents (智能体与提示词模板)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Agent 本身就是 Prompt Template。定义消息时序、输入占位符、输出 Schema 与生成默认参数。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (confirm("确定要将 7 个内置 Agent 重置为最新的默认提示词模板吗？")) {
                await resetBuiltinAgents();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
            title="重置 7 个内置 Agent 的提示词为初始最新版本"
          >
            <span>重置内置模板</span>
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>新建 Agent</span>
          </button>
        </div>
      </div>

      {/* Agents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
            <tr>
              <th className="py-3 px-4">名称 / ID</th>
              <th className="py-3 px-4">描述</th>
              <th className="py-3 px-4">标签</th>
              <th className="py-3 px-4">版本</th>
              <th className="py-3 px-4">更新日期</th>
              <th className="py-3 px-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3 px-4">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-900">{agent.name}</div>
                    <div className="font-mono text-[11px] text-blue-600">{agent.id}</div>
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-600 max-w-sm line-clamp-2">
                  {agent.description}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {(agent.tags || ["核心"]).map((tag) => (
                      <span
                        key={tag}
                        className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                  {agent.version || "v1.0"}
                </td>
                <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                  {agent.updatedAt || "2026-09-11"}
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    onClick={() => handleEdit(agent.id)}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-medium transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDuplicate(agent.id)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-colors"
                    title="复制为副本"
                  >
                    <Copy className="w-3 h-3 inline mr-1" />
                    复制
                  </button>
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="px-2 py-1 text-slate-400 hover:text-rose-600 rounded text-[11px] transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
