import React, { useState } from "react";
import {
  Server,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  Search,
  ExternalLink,
  Layers,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Backend } from "../../types";
import { useBackendStore } from "../../stores/useBackendStore";
import { useAgentGroupStore } from "../../stores/useAgentGroupStore";

export const BackendsPage: React.FC = () => {
  const { groups } = useAgentGroupStore();
  const {
    backends,
    saveBackend,
    deleteBackend,
    testConnection,
    refreshModels,
    testingStatus,
  } = useBackendStore();

  const [editingBackend, setEditingBackend] = useState<Backend | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  const handleEdit = (backend: Backend) => {
    setEditingBackend(JSON.parse(JSON.stringify(backend)));
    setApiKeyInput("");
    setShowApiKey(false);
    setModelSearch("");
    setManualModel("");
  };

  const handleCreateNew = () => {
    const newBackend: Backend = {
      id: `backend_${Date.now()}`,
      name: "新 OpenAI-compatible 服务",
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
      customHeaders: {},
      timeoutMs: 60000,
      maxConcurrency: 4,
      enabled: true,
      models: [],
      status: "unknown",
    };
    setEditingBackend(newBackend);
    setApiKeyInput("");
    setShowApiKey(false);
    setModelSearch("");
    setManualModel("");
  };

  const handleSave = async () => {
    if (!editingBackend) return;
    await saveBackend(editingBackend, apiKeyInput || undefined);
    setEditingBackend(null);
  };

  const handleDelete = async (id: string) => {
    const referencingGroups: Array<{ groupName: string; agentId: string }> = [];
    for (const group of groups) {
      for (const b of group.bindings) {
        if (b.backendId === id) {
          referencingGroups.push({ groupName: group.name, agentId: b.agentId });
        }
      }
    }

    if (referencingGroups.length > 0) {
      const details = referencingGroups
        .slice(0, 5)
        .map((r) => `· 分组 [${r.groupName}] 中的 Agent [${r.agentId}]`)
        .join("\n");
      alert(
        `无法删除该 Backend：当前仍有 ${referencingGroups.length} 处智能体绑定引用了此后端！\n\n${details}\n\n请先修改相关分组的 Backend 绑定后再尝试删除。`
      );
      return;
    }

    if (confirm("确定要删除此 Backend 吗？")) {
      await deleteBackend(id);
      if (editingBackend?.id === id) setEditingBackend(null);
    }
  };

  const handleTestConnection = async (b: Backend) => {
    await testConnection(b, apiKeyInput || undefined, false);
  };

  const handleRefreshModels = async () => {
    if (!editingBackend) return;
    setIsRefreshingModels(true);
    const updated = await refreshModels(editingBackend, apiKeyInput || undefined, false);
    setEditingBackend({ ...editingBackend, models: updated });
    setIsRefreshingModels(false);
  };

  const handleAddManualModel = () => {
    if (!editingBackend || !manualModel.trim()) return;
    const current = editingBackend.models || [];
    if (!current.includes(manualModel.trim())) {
      setEditingBackend({
        ...editingBackend,
        models: [manualModel.trim(), ...current],
      });
    }
    setManualModel("");
  };

  const filteredModels = (editingBackend?.models || []).filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            <span>Backends (模型服务管理)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            配置所有兼容 OpenAI Chat Completion API 的服务端点（OpenRouter、OpenAI、vLLM、NInfer、Ollama 等）。
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>新建 Backend</span>
        </button>
      </div>

      {/* Backend List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
            <tr>
              <th className="py-3 px-4">名称</th>
              <th className="py-3 px-4">Base URL</th>
              <th className="py-3 px-4">认证类型</th>
              <th className="py-3 px-4">状态</th>
              <th className="py-3 px-4">模型数</th>
              <th className="py-3 px-4">并发限制</th>
              <th className="py-3 px-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {backends.map((backend) => {
              const testInfo = testingStatus[backend.id];
              const isTesting = testInfo?.testing;

              return (
                <tr key={backend.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {backend.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 max-w-xs truncate">
                    {backend.baseUrl}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      {backend.authType}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          backend.status === "online"
                            ? "bg-emerald-500"
                            : backend.status === "offline"
                            ? "bg-rose-500"
                            : "bg-amber-400"
                        }`}
                      />
                      <span
                        className={`font-medium ${
                          backend.status === "online"
                            ? "text-emerald-700"
                            : backend.status === "offline"
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        {backend.status === "online"
                          ? "在线"
                          : backend.status === "offline"
                          ? "离线"
                          : "未测试"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono">
                    {backend.models?.length || 0} 个
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono">
                    {backend.maxConcurrency}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => testConnection(backend, undefined, true)}
                      disabled={isTesting}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-colors"
                      title="测试连接"
                    >
                      {isTesting ? "测试中..." : "测试"}
                    </button>
                    <button
                      onClick={() => handleEdit(backend)}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-medium transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(backend.id)}
                      className="px-2 py-1 text-slate-400 hover:text-rose-600 rounded text-[11px] transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Backend Editor Modal / Drawer */}
      {editingBackend && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-slate-900 text-sm">
                  编辑 Backend: {editingBackend.name}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTestConnection(editingBackend)}
                  disabled={testingStatus[editingBackend.id]?.testing}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  {testingStatus[editingBackend.id]?.testing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>测试连接</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
                >
                  保存
                </button>

                <button
                  type="button"
                  onClick={() => setEditingBackend(null)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium"
                >
                  取消
                </button>
              </div>
            </div>

            {/* Test connection alert message if exists */}
            {testingStatus[editingBackend.id]?.result && (
              <div
                className={`mx-6 mt-4 p-3 rounded-lg text-xs flex items-center justify-between ${
                  testingStatus[editingBackend.id].result?.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {testingStatus[editingBackend.id].result?.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>
                    {testingStatus[editingBackend.id].result?.success
                      ? `连接成功！响应时间: ${testingStatus[editingBackend.id].result?.latency_ms}ms，获取到 ${testingStatus[editingBackend.id].result?.model_count} 个可用模型。`
                      : `连接失败: ${testingStatus[editingBackend.id].result?.error}`}
                  </span>
                </div>
              </div>
            )}

            {/* Content: Form on Left, Models on Right */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    名称
                  </label>
                  <input
                    type="text"
                    value={editingBackend.name}
                    onChange={(e) =>
                      setEditingBackend({ ...editingBackend, name: e.target.value })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base URL (以 /v1 结尾)
                  </label>
                  <input
                    type="text"
                    value={editingBackend.baseUrl}
                    onChange={(e) =>
                      setEditingBackend({ ...editingBackend, baseUrl: e.target.value })
                    }
                    placeholder="https://openrouter.ai/api/v1"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    认证类型 (Authentication)
                  </label>
                  <select
                    value={editingBackend.authType}
                    onChange={(e) =>
                      setEditingBackend({
                        ...editingBackend,
                        authType: e.target.value as any,
                      })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="bearer">Bearer Token (API Key)</option>
                    <option value="none">None (本地无密码)</option>
                  </select>
                </div>

                {editingBackend.authType === "bearer" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        API Key (安全保存在 OS Keyring)
                      </label>
                      <span className="text-[10px] text-slate-400">
                        SQLite中只保留安全引用
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="输入新的 API Key（留空则保持现有不变）"
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-9 outline-none focus:border-blue-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Advanced Settings */}
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    高级设置
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        超时时间 (秒)
                      </label>
                      <input
                        type="number"
                        value={Math.round(editingBackend.timeoutMs / 1000)}
                        onChange={(e) =>
                          setEditingBackend({
                            ...editingBackend,
                            timeoutMs: Number(e.target.value) * 1000,
                          })
                        }
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        最大并发数 (maxConcurrency)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={editingBackend.maxConcurrency}
                        onChange={(e) =>
                          setEditingBackend({
                            ...editingBackend,
                            maxConcurrency: Number(e.target.value),
                          })
                        }
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Models List on Right */}
              <div className="flex flex-col border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    模型列表 ({(editingBackend.models || []).length})
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={isRefreshingModels}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-sm font-medium transition-colors"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isRefreshingModels ? "animate-spin" : ""}`}
                    />
                    <span>刷新</span>
                  </button>
                </div>

                {/* Search & Manual add */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索模型..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Model scroll list */}
                <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1 bg-white border border-slate-200 rounded-lg p-2 text-xs">
                  {filteredModels.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      无可用模型，可点击右上角“刷新”或在下方手动添加。
                    </div>
                  ) : (
                    filteredModels.map((modelId) => (
                      <div
                        key={modelId}
                        className="py-1 px-2 hover:bg-slate-50 rounded flex items-center justify-between font-mono text-[11px] text-slate-700 group"
                      >
                        <span className="truncate">{modelId}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBackend({
                              ...editingBackend,
                              models: editingBackend.models?.filter((m) => m !== modelId),
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Manual Model Add */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="手动输入 Model ID (如 nvidia/nemotron-3-super-120b-a12b:free)"
                    value={manualModel}
                    onChange={(e) => setManualModel(e.target.value)}
                    className="flex-1 text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualModel}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
