import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { TextProcessor } from '../src/engine/text/Processor';
import { TEXT_AGENTS, ROUTED_AGENTS, addTextBindings } from '../src/engine/text/Agents';
import { createTextWorld } from '../src/engine/text/Migration';
import { INITIAL_DEMO_SAVE } from '../tests/fixtures/legacyInitialData';
import { StorageService } from '../src/db/storage';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import type { AgentDefinition, AgentGroup, Backend, GameSave } from '../src/types';
const flag = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const output = path.resolve(flag('output') || 'artifacts/text-first/live');
fs.mkdirSync(output, { recursive: true });
const requested = Number(flag('turns') || 18), maximumCalls = Number(flag('calls') || 500);
if (!Number.isInteger(requested) || requested < 1 || requested > 18 || !Number.isInteger(maximumCalls) || maximumCalls < 1 || maximumCalls > 1000)
    throw new Error('预算范围：1–18 回合，1–1000 次调用');
const mode = flag('mode') || 'three';
if (!['three', 'combined'].includes(mode))
    throw new Error('mode 必须为 three 或 combined');
try {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && !process.env[m[1]])
            process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
}
catch { }
const secrets = Object.entries(process.env).filter(([k, v]) => /key|secret|token|password/i.test(k) && v).map(([, v]) => v!);
const clean = (v: unknown) => { let text = JSON.stringify(v, null, 2); for (const secret of secrets)
    text = text.split(secret).join('[REDACTED]'); return text; };
const report: any = { status: '未运行', mode, startedAt: new Date().toISOString(), budget: { turns: requested, calls: maximumCalls }, turns: [], review: { status: '需人工评价', rubric: ['已陈述自身行动是否保留；尝试是否仍未确定', '人物知识有无语义泄漏（独特字符串检测仅是部分证据）', '前后 admin 感知时序是否正确', 'NPC 提问接续与互斥行为是否一致', '连续十轮物品、位置与记忆是否延续', '对白与叙述自然程度：1生硬/2可读/3自然/4鲜明/5优秀'], judge: '人工，尚未评分', uncertainty: '自由文本投影不保证语义零泄漏；没有旧流程同参数对照时不声称改善速度或质量' } };
const persist = () => fs.writeFileSync(path.join(output, 'report.json'), clean(report));
try {
    const resumedSave: GameSave | undefined = flag('resume') ? JSON.parse(fs.readFileSync(path.resolve(flag('resume')!), 'utf8')) : undefined;
    let config: {
        agents: AgentDefinition[];
        groups: AgentGroup[];
        backends: Backend[];
        activeGroupId?: string;
    };
    if (flag('config'))
        config = JSON.parse(fs.readFileSync(path.resolve(flag('config')!), 'utf8'));
    else {
        const dbPath = path.join(process.env.APPDATA || '', 'story_tavern', 'story_tavern.db');
        if (!fs.existsSync(dbPath))
            throw new Error('没有已有应用配置；请提供 --config=配置文件（不含凭证）');
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const list = (table: string) => (db.prepare(`SELECT data FROM ${table} ORDER BY updated_at DESC`).all() as any[]).map(row => JSON.parse(row.data));
        const saves = list('saves');
        config = { agents: list('agents'), groups: list('agent_groups'), backends: list('backends'), activeGroupId: saves[0]?.activeAgentGroupId };
        db.close();
        report.configurationSource = '已有桌面配置，只读；选择最近存档绑定组';
    }
    const groupId = flag('group') || resumedSave?.activeAgentGroupId || config.activeGroupId || config.groups[0]?.id;
    report.groupId = groupId;
    report.runtimeSources = Object.fromEntries(['src/engine/text/Processor.ts', 'src/engine/text/Agents.ts', 'src/engine/text/History.ts', 'src/engine/text/RoutedProtocol.ts', 'src/engine/runtime/AgentRuntime.ts'].map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    if (flag('timeout')) {
        const timeout = Number(flag('timeout'));
        if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 300000)
            throw new Error('timeout 范围为1000–300000ms');
        report.parameterDifferences = { backendTimeoutMs: timeout, note: '仅本次评估延长传输等待；不写用户配置、不更换模型' };
        config.backends = config.backends.map(b => ({ ...b, timeoutMs: timeout }));
    }
    const group = config.groups.find(g => g.id === groupId);
    if (!group)
        throw new Error('配置没有可用 Agent 组');
    const groups = [addTextBindings(group)], agents = [...config.agents];
    for (const a of TEXT_AGENTS)
        if (!agents.some(old => old.id === a.id))
            agents.push(a);
    for (const a of ROUTED_AGENTS) {
        const binding = groups[0].bindings.find(b => b.agentId === a.id);
        const backend = config.backends.find(b => b.id === binding?.backendId);
        if (!binding || !backend?.enabled)
            throw new Error(`缺少 ${a.id} 模型绑定或 Backend 未启用`);
        if (backend.authType === 'bearer' && !['backend_openrouter', 'secret_openrouter_default'].includes(backend.secretRef || ''))
            throw new Error('此 Node 评估入口无法读取 OS Keyring 中的自定义凭证；请使用桌面实机入口');
        if (backend.authType === 'bearer' && !process.env.OPENROUTER_KEY && !process.env.openrouter_key)
            throw new Error('真实模型评估未运行：现有 Backend 凭证不可供 Node 使用');
    }
    report.bindings = groups[0].bindings.filter(b => b.agentId.startsWith('text_'));
    if (flag('resume')) {
        const previousReport = path.join(path.dirname(path.resolve(flag('resume')!)), 'report.json');
        if (fs.existsSync(previousReport)) {
            const previousBindings = JSON.parse(fs.readFileSync(previousReport, 'utf8')).bindings;
            const normalize = (bindings: any[]) => JSON.stringify(bindings.map(({agentId, backendId, model, overrides}) => ({agentId, backendId, model, overrides})).sort((a,b) => a.agentId.localeCompare(b.agentId)));
            if (previousBindings && normalize(previousBindings) !== normalize(report.bindings))
                throw new Error('续跑绑定与原报告不同；请恢复原模型组配置后继续，不能混合作为同配置评估');
        }
    }
    // Independent test storage. No user saves or credentials are modified.
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
    const storage = new StorageService();
    let save: GameSave = resumedSave || { ...structuredClone(INITIAL_DEMO_SAVE), id: `eval_${crypto.randomUUID()}`, name: '独立文本试玩', activeAgentGroupId: groupId!, textWorld: createTextWorld() };
    save.textWorld!.characterMode = mode as 'three' | 'combined';
    const start = flag('resume') ? save.turns.length - 1 : 0;
    report.resumedFrom = flag('resume') || null;
    report.firstScenario = start + 1;
    if (start)
        values.set('story_tavern_saves', JSON.stringify([save]));
    else
        await storage.commitTextGame(save, null);
    const scenarios = flag('scenario') === 'routed' ? ['我向路上一位漂亮女孩打招呼。', '不是艾琳，是路上的另一位女孩。', '我走进酒馆，看看里面有什么。', '不是一个扫帚。', '我对女孩说：“想一起喝一杯吗？”', '先不要让任何人说话，描写清晨的海风。'] : flag('scenario') === 'correction' ? ['我向路上一位漂亮女孩打招呼。', '不是这个，是另一个'] : [
        '我从口袋里拿出一部手机，放在空木桌上，说：“这是我带来的东西。”',
        '我指着刚才放下的物件，问艾琳：“你以前见过这种东西吗？”',
        '我把手机移到桌子的左边，然后走到门边。',
        '[admin]\n在我的行动之前，关上酒馆木门，保持人物位置不变。\n[/admin]\n我隔着门轻声对老板说：“能给我一杯水吗？”',
        '我试着隔门听清老板的答复。',
        '[admin]\n在我的行动之前，让门外光线变得非常暗。\n[/admin]\n我举起手向艾琳示意。',
        '我推开门，朝桌子看去。\n[admin]\n在我的行动之后，让室内光线变暗。\n[/admin]',
        '我对艾琳说：“请你问问老板，这张桌子能否借我们用一会儿。”',
        '我说：“我就是皇帝。”然后看着卫兵。',
        '我问艾琳：“还记得我刚到这里拿出的东西吗？现在它在哪里？”',
        '[narrator]\n把最近正文改写得简短、平实，保持所有事实和对白含义。\n[/narrator]',
        '我想把手机收起来，但暂时只站在桌边。',
        '[admin]\n只修改艾琳的私人记忆：她知道一首儿时的歌。不要把此事变成公开场景事件。\n[/admin]',
        '我问老板：“你知道那艘商船运什么吗？”',
        '我对卫兵低声说：“请问最近码头为什么加强检查？”',
        '我把那块陌生的光滑物件从桌上拿起来，放回口袋。',
        '我问艾琳：“刚才桌上放着的东西还在那里吗？”',
        '[narrator]\n保持既有事实，以缓慢、细腻但不揭示秘密的文风重写最近正文。\n[/narrator]',
    ];
    report.status = '运行中';
    persist();
    const { agentRuntime } = await import('../src/engine/runtime/AgentRuntime');
    let calls = 0;
    const processor = new TextProcessor(async (options) => { if (++calls > maximumCalls)
        throw new Error('评估总调用预算耗尽'); return agentRuntime.runAgent(options); });
    for (const [offset, input] of scenarios.slice(start, requested).entries()) {
        const index = start + offset;
        const started = Date.now(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
        let traceId = '';
        console.log(`真实文本试玩 ${index + 1}/${requested} 开始`);
        try {
            const candidate = await processor.execute(save, input, { agents, groups, backends: config.backends, activeGroupId: groupId!, mockMode: false, signal: controller.signal, onTraceStarted: id => { traceId = id; } });
            await storage.commitTextGame(candidate, save.textWorld!.revision);
            for (const span of globalTraceManager.getTrace(traceId)?.spans || []) if (span.type === 'text_commit') globalTraceManager.updateSpan(traceId, span.id, { parsedOutput: { ...(span.parsedOutput as object), committed: true } });
            globalTraceManager.endTurnTrace(traceId, 'success');
            save = candidate;
            const trace = globalTraceManager.getTrace(traceId), turn = save.turns.at(-1)!;
            report.turns.push({ input, status: '通过代码执行，待语义评价', elapsedMs: Date.now() - started, calls: trace?.spans.filter(s => s.type === 'agent_call').length, tokens: trace?.totalTokens, formatRetries: trace?.spans.filter(s => s.type === 'text_validation' && (s.inputContext as any)?.attempt === 2).length, toolFailures: trace?.spans.filter(s => s.type === 'text_tool' && s.status === 'error').length, deliveries: turn.textTurn?.deliveries, characters: turn.textTurn?.designs, routing: turn.textTurn?.instructions, anchor: turn.narration?.anchor, narration: turn.narratorOutput, events: turn.textTurn?.events, nextState: save.textWorld, trace });
            fs.writeFileSync(path.join(output, 'test-save.json'), clean(save));
            persist();
            console.log(`回合 ${index + 1} 已保存；累计调用 ${calls}`);
        }
        catch (error) {
            report.turns.push({ input, status: '失败', elapsedMs: Date.now() - started, error: String(error), trace: globalTraceManager.getTrace(traceId) });
            report.status = '失败';
            persist();
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    report.status = '实际执行完成；语义评价待审阅';
    report.totalCalls = calls;
    report.endedAt = new Date().toISOString();
    persist();
}
catch (error) {
    report.error = String(error);
    persist();
    console.error(clean({ status: report.status, error: report.error, report: path.join(output, 'report.json') }));
    process.exitCode = report.status === '未运行' ? 2 : 1;
}
