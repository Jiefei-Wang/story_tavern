import { useGameStore } from "../../stores/useGameStore";
import { HARBOR_WORLD_DEFINITION } from "../../engine/character-schema/HarborSchema";
import { buildCharacterSchemaPrompt } from "../../engine/character-schema/CharacterSchema";
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Play,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Tag,
  Loader2,
} from "lucide-react";
import { AgentDefinition, AgentMessage } from "../../types";
import { useAgentStore } from "../../stores/useAgentStore";
import { useAgentGroupStore } from "../../stores/useAgentGroupStore";
import { useBackendStore } from "../../stores/useBackendStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { renderMessages } from "../../engine/template/PlaceholderEngine";
import { agentRuntime } from "../../engine/runtime/AgentRuntime";
import { JsonViewer } from "../../components/Common/JsonViewer";

const AVAILABLE_VARIABLES = [
  {
    category: "Player (玩家)",
    vars: ["{{player.input}}", "{{text player.input}}"],
  },
  {
    category: "NPC (角色与心智)",
    vars: [
      "{{npc.name}}",
      "{{npc.location}}",
      "{{json npc.attributes}}",
      "{{json npc.relationships}}",
      "{{characterSchemaPrompt}}",
      "{{json npc}}",
    ],
  },
  {
    category: "Scene (场景与环境)",
    vars: ["{{scene.location}}", "{{scene.weather}}", "{{scene.lighting}}", "{{json scene}}"],
  },
  {
    category: "Observations (感知观察)",
    vars: ["{{observations}}", "{{json observations}}"],
  },
  {
    category: "Timing (时序与预算)",
    vars: ["{{reaction.available_time}}", "{{reaction.response_window}}"],
  },
  {
    category: "Events (事件列表)",
    vars: ["{{events}}", "{{json events}}", "{{npcReactions}}", "{{json npcReactions}}"],
  },
];

const DEFAULT_SAMPLE_CONTEXT = {
  player: { input: "我走到窗边，对艾琳低声说：“今晚离开这里。”" },
  scene: {
    location: "tavern_outside",
    weather: "clear",
    lighting: "morning",
    description: "港口外的薄雾正在散去",
  },
  npc: {
    id: "erin",
    name: "艾琳 (Erin)",
    location: "tavern_outside",
    attributes: {},
  },
  observations: [
    { eventId: "e1", saw: true, heard: false },
    { eventId: "e2", saw: true, heard: true, content: "今晚离开这里。" },
  ],
  reaction: {
    available_time: 2.5,
    response_window: false,
  },
};

export const AgentEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { agents, saveAgent } = useAgentStore();
  const { groups, activeGroupId } = useAgentGroupStore();
  const { backends } = useBackendStore();
  const { settings } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<
    "basic" | "messages" | "inputs" | "schema" | "defaults" | "preview"
  >("messages");

  const [agent, setAgent] = useState<AgentDefinition | null>(null);
  const [activeMessageIndex, setActiveMessageIndex] = useState<number>(0);
  const [sampleContextJson, setSampleContextJson] = useState(
    JSON.stringify({ ...DEFAULT_SAMPLE_CONTEXT, characterSchema: useGameStore.getState().activeSave?.worldDefinition.characterSchema || HARBOR_WORLD_DEFINITION.characterSchema, characterSchemaPrompt: buildCharacterSchemaPrompt(useGameStore.getState().activeSave?.worldDefinition.characterSchema || HARBOR_WORLD_DEFINITION.characterSchema), npc: { ...DEFAULT_SAMPLE_CONTEXT.npc, ...(Object.values(useGameStore.getState().activeSave?.worldState.entities || {}).find(e => e.type === "character") || {}) } }, null, 2)
  );
  const [renderedPreview, setRenderedPreview] = useState<Array<{ role: string; content: string }> | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [schemaJsonText, setSchemaJsonText] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    if (id === "new") {
      const newDef: AgentDefinition = {
        id: `agent_${Date.now()}`,
        name: "新建 Agent",
        description: "自定义 Agent 描述",
        messages: [
          { id: "m1", role: "system", content: "You are an AI assistant." },
          { id: "m2", role: "user", content: "Input: {{player.input}}" },
        ],
        inputs: [{ name: "player.input", type: "string", required: true }],
        outputSchema: null,
        defaults: {
          temperature: 0.7,
          maxTokens: 0,
        },
      };
      setAgent(newDef);
      setSchemaJsonText("");
    } else {
      const existing = agents.find((a) => a.id === id);
      if (existing) {
        setAgent(JSON.parse(JSON.stringify(existing)));
        setSchemaJsonText(
          existing.outputSchema ? JSON.stringify(existing.outputSchema, null, 2) : ""
        );
      }
    }
  }, [id, agents]);

  if (!agent) {
    return <div className="p-10 text-center text-slate-500 text-xs">正在载入 Agent...</div>;
  }

  const handleSave = async () => {
    let parsedSchema = null;
    if (schemaJsonText.trim()) {
      try {
        parsedSchema = JSON.parse(schemaJsonText);
      } catch (err: any) {
        setSchemaError("JSON Schema 语法错误: " + err.message);
        setActiveTab("schema");
        return;
      }
    }

    const updated = {
      ...agent,
      outputSchema: parsedSchema,
    };

    await saveAgent(updated);
    navigate("/agents");
  };

  const handleAddMessage = (role: "system" | "user" | "assistant") => {
    const newMsg: AgentMessage = {
      id: `m_${Date.now()}`,
      role,
      content: "",
    };
    const updated = [...agent.messages, newMsg];
    setAgent({ ...agent, messages: updated });
    setActiveMessageIndex(updated.length - 1);
  };

  const handleUpdateMessageContent = (idx: number, content: string) => {
    const updated = [...agent.messages];
    updated[idx].content = content;
    setAgent({ ...agent, messages: updated });
  };

  const handleDeleteMessage = (idx: number) => {
    if (agent.messages.length <= 1) return;
    const updated = agent.messages.filter((_, i) => i !== idx);
    setAgent({ ...agent, messages: updated });
    setActiveMessageIndex(Math.max(0, idx - 1));
  };

  const handleDuplicateMessage = (idx: number) => {
    const target = agent.messages[idx];
    const dup: AgentMessage = {
      ...target,
      id: `m_${Date.now()}`,
    };
    const updated = [...agent.messages];
    updated.splice(idx + 1, 0, dup);
    setAgent({ ...agent, messages: updated });
    setActiveMessageIndex(idx + 1);
  };

  const handleMoveMessage = (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= agent.messages.length) return;
    const updated = [...agent.messages];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setAgent({ ...agent, messages: updated });
    setActiveMessageIndex(targetIdx);
  };

  const handleInsertVariable = (variableStr: string) => {
    if (activeMessageIndex < 0 || activeMessageIndex >= agent.messages.length) return;
    const msg = agent.messages[activeMessageIndex];
    handleUpdateMessageContent(activeMessageIndex, msg.content + " " + variableStr);
  };

  const handleRenderPreview = () => {
    try {
      const parsedContext = JSON.parse(sampleContextJson);
      const rendered = renderMessages(agent.messages, parsedContext);
      setRenderedPreview(rendered);
    } catch (err: any) {
      alert("Sample Context JSON 解析错误: " + err.message);
    }
  };

  const handleTestAgent = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSchemaError(null);

    try {
      // 1. Validate Schema text if present
      let draftSchema = null;
      if (schemaJsonText.trim()) {
        try {
          draftSchema = JSON.parse(schemaJsonText);
        } catch (jsonErr: any) {
          const errMsg = `Schema JSON invalid: ${jsonErr.message}`;
          setSchemaError(errMsg);
          setTestResult({ success: false, error: errMsg });
          setIsTesting(false);
          return;
        }
      }

      // 2. Validate sample context JSON
      let parsedContext: any;
      try {
        parsedContext = JSON.parse(sampleContextJson);
      } catch (ctxErr: any) {
        const errMsg = `Sample Context JSON invalid: ${ctxErr.message}`;
        setTestResult({ success: false, error: errMsg });
        setIsTesting(false);
        return;
      }

      // 3. Construct test agent draft with current editor state and draft schema
      const draftAgent: AgentDefinition = {
        ...agent,
        outputSchema: draftSchema,
      };

      const testAgents: AgentDefinition[] = [
        ...agents.filter((a) => a.id !== agent.id),
        draftAgent,
      ];

      // Ensure active group has a binding for this agent (especially if new or unassigned)
      const currentGroup = groups.find((g) => g.id === activeGroupId) || groups[0];
      let testGroups = groups;
      if (currentGroup && !currentGroup.bindings.some((b) => b.agentId === agent.id)) {
        const fallbackBackend = backends[0];
        const tempBinding = {
          agentId: agent.id,
          backendId: fallbackBackend?.id || "backend_openrouter",
          model: fallbackBackend?.defaultModel || "nvidia/nemotron-3-super-120b-a12b:free",
        };
        const updatedGroup = {
          ...currentGroup,
          bindings: [...currentGroup.bindings, tempBinding],
        };
        testGroups = groups.map((g) => (g.id === currentGroup.id ? updatedGroup : g));
      }

      const res = await agentRuntime.runAgent({
        agentId: agent.id,
        groupId: currentGroup?.id || activeGroupId,
        context: parsedContext,
        agents: testAgents,
        groups: testGroups,
        backends,
        mockMode: settings.mockLlmMode,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* Top action bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/agents")}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <span>编辑 Agent: {agent.name}</span>
              <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {agent.id}
              </span>
            </h1>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存 Agent</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 text-xs font-medium shrink-0">
        <button
          onClick={() => setActiveTab("basic")}
          className={`px-4 py-2 border-b-2 transition-all ${
            activeTab === "basic"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          基本信息
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          className={`px-4 py-2 border-b-2 transition-all ${
            activeTab === "messages"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          提示词 (Messages) ({agent.messages.length})
        </button>
        <button
          onClick={() => setActiveTab("inputs")}
          className={`px-4 py-2 border-b-2 transition-all ${
            activeTab === "inputs"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          输入变量 ({agent.inputs?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("schema")}
          className={`px-4 py-2 border-b-2 transition-all ${
            activeTab === "schema"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          输出 Schema
        </button>
        <button
          onClick={() => setActiveTab("defaults")}
          className={`px-4 py-2 border-b-2 transition-all ${
            activeTab === "defaults"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          默认参数
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`px-4 py-2 border-b-2 transition-all ${
            activeTab === "preview"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          测试运行 / 预览
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        {/* Tab 1: Basic */}
        {activeTab === "basic" && (
          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Agent ID (代码唯一引用)</span>
                {[
                  "input_compiler",
                  "perception",
                  "npc_reaction",
                  "world_resolver",
                  "time_skip",
                  "admin_patch",
                  "narrator",
                ].includes(agent.id) ? (
                  <span className="text-[11px] text-blue-600 font-normal">
                    (引擎内置核心契约，只读)
                  </span>
                ) : id !== "new" ? (
                  <span className="text-[11px] text-slate-400 font-normal">
                    (已保存 Agent 唯一标识，只读)
                  </span>
                ) : null}
              </label>
              <input
                type="text"
                value={agent.id}
                readOnly={id !== "new"}
                disabled={id !== "new"}
                onChange={(e) => {
                  if (id === "new") setAgent({ ...agent, id: e.target.value });
                }}
                className={`w-full text-xs font-mono border rounded-lg px-3 py-2 outline-none ${
                  id !== "new"
                    ? "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
                    : "bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-800"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                名称 (Display Name)
              </label>
              <input
                type="text"
                value={agent.name}
                onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                描述
              </label>
              <textarea
                rows={3}
                value={agent.description}
                onChange={(e) => setAgent({ ...agent, description: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Messages Editor with Right Variables Drawer */}
        {activeTab === "messages" && (
          <div className="flex gap-6 h-full">
            {/* Left: Message Cards Stream */}
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">
                  点击下方卡片可编辑，右侧点击变量即可插入对应占位符：
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAddMessage("system")}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium"
                  >
                    + System
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddMessage("user")}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-medium"
                  >
                    + User
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddMessage("assistant")}
                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded text-xs font-medium"
                  >
                    + Assistant
                  </button>
                </div>
              </div>

              {agent.messages.map((msg, idx) => {
                const isFocused = activeMessageIndex === idx;

                return (
                  <div
                    key={msg.id || idx}
                    onClick={() => setActiveMessageIndex(idx)}
                    className={`rounded-xl border transition-all ${
                      isFocused
                        ? "border-blue-500 ring-2 ring-blue-500/10 shadow-sm"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {/* Message Header */}
                    <div className="h-9 px-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between rounded-t-xl text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono uppercase font-bold text-[10px] px-2 py-0.5 rounded ${
                            msg.role === "system"
                              ? "bg-slate-200 text-slate-700"
                              : msg.role === "user"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          }`}
                        >
                          {msg.role}
                        </span>
                        <span className="text-[11px] text-slate-400">#{idx + 1}</span>
                      </div>

                      <div className="flex items-center gap-1 text-slate-400">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveMessage(idx, "up");
                          }}
                          disabled={idx === 0}
                          className="p-1 hover:text-slate-700 disabled:opacity-30"
                          title="上移"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveMessage(idx, "down");
                          }}
                          disabled={idx === agent.messages.length - 1}
                          className="p-1 hover:text-slate-700 disabled:opacity-30"
                          title="下移"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateMessage(idx);
                          }}
                          className="p-1 hover:text-slate-700"
                          title="复制消息"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMessage(idx);
                          }}
                          disabled={agent.messages.length <= 1}
                          className="p-1 hover:text-rose-600 disabled:opacity-30"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Message Content Textarea */}
                    <div className="p-3">
                      <textarea
                        rows={msg.content.split("\n").length > 4 ? 6 : 4}
                        value={msg.content}
                        onChange={(e) => handleUpdateMessageContent(idx, e.target.value)}
                        placeholder={`输入 ${msg.role} 提示词内容……`}
                        className="w-full text-xs font-mono bg-transparent outline-none resize-y leading-relaxed text-slate-800"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Available Variables Drawer */}
            <div className="w-72 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 shrink-0 overflow-y-auto max-h-[600px]">
              <div>
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  <span>可用变量 (点击插入)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  点击将占位符插入到当前激活的消息框中。
                </p>
              </div>

              <div className="space-y-3">
                {AVAILABLE_VARIABLES.map((cat) => (
                  <div key={cat.category} className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {cat.category}
                    </span>
                    <div className="space-y-1">
                      {cat.vars.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleInsertVariable(v)}
                          className="w-full text-left font-mono text-[11px] px-2 py-1 rounded bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 text-slate-700 transition-all truncate block"
                          title={`点击插入 ${v}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Inputs */}
        {activeTab === "inputs" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                定义传递给当前 Agent 的输入变量结构：
              </span>
              <button
                type="button"
                onClick={() => {
                  const updated = [
                    ...(agent.inputs || []),
                    { name: "new_variable", type: "string", required: true },
                  ];
                  setAgent({ ...agent, inputs: updated });
                }}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加变量</span>
              </button>
            </div>

            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 px-3">变量名</th>
                  <th className="py-2 px-3">类型 / 说明</th>
                  <th className="py-2 px-3 text-center">必填</th>
                  <th className="py-2 px-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(agent.inputs || []).map((inp, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={inp.name}
                        onChange={(e) => {
                          const updated = [...agent.inputs];
                          updated[idx].name = e.target.value;
                          setAgent({ ...agent, inputs: updated });
                        }}
                        className="w-full font-mono text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={inp.type}
                        onChange={(e) => {
                          const updated = [...agent.inputs];
                          updated[idx].type = e.target.value;
                          setAgent({ ...agent, inputs: updated });
                        }}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={inp.required}
                        onChange={(e) => {
                          const updated = [...agent.inputs];
                          updated[idx].required = e.target.checked;
                          setAgent({ ...agent, inputs: updated });
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = agent.inputs.filter((_, i) => i !== idx);
                          setAgent({ ...agent, inputs: updated });
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Output Schema */}
        {activeTab === "schema" && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <span className="text-xs font-semibold text-slate-700">
                JSON Output Schema (留空则代表纯文本输出，如 Narrator)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                模型返回结果将依据此 Schema 进行 JSON 结构化校验。
              </p>
            </div>

            {schemaError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{schemaError}</span>
              </div>
            )}

            <textarea
              rows={12}
              value={schemaJsonText}
              onChange={(e) => {
                setSchemaJsonText(e.target.value);
                setSchemaError(null);
              }}
              placeholder={`{\n  "type": "object",\n  "properties": {\n    "thought": { "type": "string" }\n  }\n}`}
              className="w-full text-xs font-mono bg-slate-900 text-slate-100 rounded-xl p-4 outline-none resize-y leading-relaxed"
            />
          </div>
        )}

        {/* Tab 5: Defaults */}
        {activeTab === "defaults" && (
          <div className="max-w-md space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                默认温度 (Temperature)
              </label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={agent.defaults.temperature ?? 0.7}
                onChange={(e) =>
                  setAgent({
                    ...agent,
                    defaults: {
                      ...agent.defaults,
                      temperature: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                最大生成 Token (Max Tokens，0 = 无上限)
              </label>
              <input
                type="number"
                step={100}
                min={0}
                value={agent.defaults.maxTokens ?? 0}
                onChange={(e) =>
                  setAgent({
                    ...agent,
                    defaults: {
                      ...agent.defaults,
                      maxTokens: e.target.value ? parseInt(e.target.value) : 0,
                    },
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* Tab 6: Preview & Test Agent */}
        {activeTab === "preview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Sample Context editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Sample Context (样本变量 JSON)
                </span>
                <button
                  type="button"
                  onClick={handleRenderPreview}
                  className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-medium transition-colors"
                >
                  渲染预览 (Render Messages)
                </button>
              </div>

              <textarea
                rows={12}
                value={sampleContextJson}
                onChange={(e) => setSampleContextJson(e.target.value)}
                className="w-full text-xs font-mono bg-slate-900 text-slate-100 rounded-xl p-3 outline-none leading-relaxed"
              />

              <button
                type="button"
                onClick={handleTestAgent}
                disabled={isTesting}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>用当前 Agent Group 测试调用 (Test Agent)</span>
              </button>
            </div>

            {/* Right: Rendered Messages & Test output */}
            <div className="space-y-4 overflow-y-auto">
              <span className="text-xs font-bold text-slate-800">
                渲染后的提示词 (Resolved Messages)
              </span>

              {renderedPreview ? (
                <div className="space-y-2">
                  {renderedPreview.map((m, i) => (
                    <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-mono font-bold uppercase text-blue-600">
                        {m.role}
                      </span>
                      <pre className="text-xs font-mono whitespace-pre-wrap text-slate-800">
                        {m.content}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                  点击左侧“渲染预览”按钮，查看替换变量后的完整提示词。
                </div>
              )}

              {testResult && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-800">模型调用结果:</span>
                  <JsonViewer data={testResult} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
