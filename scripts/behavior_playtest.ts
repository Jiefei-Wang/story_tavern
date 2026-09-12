import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { behaviorScenarios } from "../tests/fixtures/behaviorScenarios";
import { lowMagicExecutionControlScenarios } from '../tests/fixtures/lowMagicExecutionControl';
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { assertCharacterSchema, validateCharacterAgainstSchema } from "../src/engine/character-schema/CharacterSchema";
import { advanceChain, evaluateHardExpectations, evaluateStructure, extractTurnEvidence, redactEvidence, renderBehaviorReview, requireUnitTestGroup, type BehaviorRunConfiguration } from "../src/engine/evaluation/BehaviorEvaluation";

function flag(name: string): string | undefined {
  return process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}
for (const argument of process.argv.slice(2)) {
  if (!/^--(?:config|scenario|output|suite)=.+$/.test(argument)) throw new Error(`Unsupported option ${argument}; use --config=path --scenario=id --output=dir --suite=behavior|process-control. This runner never uses mock fallback.`);
}
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch (error: any) {
  if (error.code !== "ENOENT") throw error;
}
const secretValues = Object.entries(process.env).filter(([key, value]) => /key|secret|token|password|credential/i.test(key) && !!value).map(([,value]) => value!);
const clean = <T>(value: T): T => redactEvidence(value, secretValues);
const configPath = path.resolve(flag("config") || "artifacts/behavior-tests/unit-test-config.json");
const configSource = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(configSource) as BehaviorRunConfiguration;
const group = requireUnitTestGroup(config);
const selected = flag("scenario");
const suite = flag('suite') || 'behavior';
if (!['behavior', 'process-control'].includes(suite)) throw new Error(`Unknown suite '${suite}'`);
const candidates = suite === 'process-control' ? lowMagicExecutionControlScenarios : behaviorScenarios;
const scenarios = candidates.filter(scenario => !selected || scenario.id === selected);
if (!scenarios.length) throw new Error(`Unknown scenario '${selected}'; available: ${candidates.map(s => s.id).join(", ")}`);
const outputDirectory = path.resolve(flag("output") || "artifacts/behavior-tests/live");
fs.mkdirSync(outputDirectory, { recursive: true });
// Config snapshots alone do not identify runtime fixes made between live runs.
const sourceFiles = ['src/engine', 'src/types', 'src/db'].flatMap(directory => fs.readdirSync(directory, { recursive: true }).filter(file => /\.tsx?$/.test(String(file))).map(file => path.join(directory, String(file)))).sort();
const runtimeCodeSHA256 = createHash('sha256');
for (const file of sourceFiles) runtimeCodeSHA256.update(file.replaceAll('\\', '/') + '\n').update(fs.readFileSync(file));
const runtimeFingerprint = runtimeCodeSHA256.digest('hex');
let structureFailures = 0;
let hardExpectationFailures = 0;
for (const scenario of scenarios) {
  assertCharacterSchema(scenario.worldDefinition.characterSchema);
  for (const [id, entity] of Object.entries(scenario.initialWorld.entities)) {
    if (entity.type !== "character") continue;
    const validation = validateCharacterAgainstSchema(entity, scenario.worldDefinition.characterSchema, scenario.initialWorld);
    if (!validation.valid) throw new Error(`Invalid fixture ${scenario.id}/${id}: ${validation.errors.join("; ")}`);
  }
  let world = structuredClone(scenario.initialWorld);
  let priorFailures: number[] = [];
  const actualTurns: import('../src/types').GameTurn[] = [];
  const report: any = {
    version: 1, mode: "live", suite, startedAt: new Date().toISOString(),
    configuration: { sourcePath: configPath, sha256: createHash("sha256").update(configSource).digest("hex"), runtimeCodeSHA256: runtimeFingerprint, group: clean(group), agentIds: config.agents.map(agent => agent.id) },
    scenario: structuredClone(scenario),
    phase2: { status: "manual_review_pending", note: "此脚本不评定行为正确；请另存逐轮人工审阅，保留原始证据。" },
    turns: [],
  };
  const persist = () => {
    const safeReport = clean(report);
    fs.writeFileSync(path.join(outputDirectory, `${scenario.id}.json`), JSON.stringify(safeReport, null, 2));
    fs.writeFileSync(path.join(outputDirectory, `${scenario.id}.md`), renderBehaviorReview(safeReport));
  };
  persist();
  for (const [index, turn] of scenario.turns.entries()) {
    const turnNumber = index + 1;
    console.log(`${scenario.id} ${turnNumber}/${scenario.turns.length} starting`);
    const before = structuredClone(world);
    const result = await gamePipeline.executeTurn(turn.input, before, turnNumber, {
      agents: config.agents, groups: config.groups, backends: config.backends,
      activeGroupId: group.id, mockMode: false, worldDefinition: scenario.worldDefinition,
      recentTurns: actualTurns,
    });
    actualTurns.push(result.turn);
    const trace = structuredClone(globalTraceManager.getTrace(result.traceId));
    const spans = trace?.spans || [];
    const phase1 = evaluateStructure({ input: turn.input, result, spans, worldDefinition: scenario.worldDefinition, privateCanaries: (scenario as any).privateCanaries });
    const continuation = advanceChain(before, result, priorFailures, turnNumber);
    const hardExpectations = evaluateHardExpectations(turn.machineChecks || [], before, continuation.world);
    report.turns.push({
      turnNumber, input: turn.input, expectedRoute: turn.expectedRoute, expected: turn.expectations,
      phase1, hardExpectations, phase2: phase1.phase2, chain: continuation.chain,
      success: result.success, error: result.error, narrationError: result.turn.narrationError,
      before, after: continuation.world, patches: result.turn.patches,
      committedEvents: result.turn.committedEvents, rejectedIntents: result.turn.rejectedIntents,
      npcExperiences: result.turn.npcExperiences,
      narration: result.turn.narratorOutput, evidence: extractTurnEvidence(spans), trace,
    });
    world = continuation.world;
    priorFailures = continuation.failures;
    structureFailures += phase1.status === "failed" ? 1 : 0;
    hardExpectationFailures += hardExpectations.filter(check => !check.passed).length;
    report.updatedAt = new Date().toISOString();
    persist();
    console.log(`${scenario.id} ${turnNumber}/${scenario.turns.length}: structure=${phase1.status}, gates=${phase1.safetyGates.status}, hard-failures=${hardExpectations.filter(check => !check.passed).length}, semantic=manual_review_pending, committed=${result.success}`);
  }
  report.completedAt = new Date().toISOString();
  persist();
}
console.log(`Complete: structure failures=${structureFailures}, hard expectation failures=${hardExpectationFailures}; all semantic results await manual review.`);
if (structureFailures || hardExpectationFailures) process.exitCode = 1;
