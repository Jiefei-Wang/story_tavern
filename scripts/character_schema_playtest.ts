import fs from "node:fs";
import { scenarios, worldFor } from "../tests/fixtures/characterWorlds";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
} from "../src/db/initialData";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { validateCharacterAgainstSchema } from "../src/engine/character-schema/CharacterSchema";

try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}
const mockMode = process.argv.includes("--mock");
const selected = process.argv
  .find((a) => a.startsWith("--scenario="))
  ?.split("=")[1];
const groups = structuredClone(DEFAULT_AGENT_GROUPS);
const group = groups.find((g) => g.id === "group_fast")!;
if (process.env.CHARACTER_EVAL_MODEL)
  for (const binding of group.bindings)
    binding.model = process.env.CHARACTER_EVAL_MODEL;
const outputDir =
  process.env.CHARACTER_EVAL_OUTPUT || "artifacts/character-schema";
fs.mkdirSync(outputDir, { recursive: true });
let failures = 0;
for (const scenario of scenarios.filter(
  (s) => !selected || s.id === selected,
)) {
  let world = worldFor(scenario.schema);
  const report: any = {
    scenario: scenario.label,
    mode: mockMode ? "mock" : "live",
    startedAt: new Date().toISOString(),
    model: group.bindings[0].model,
    schema: scenario.schema,
    turns: [],
  };
  for (const [index, input] of scenario.inputs.entries()) {
    console.log(`${scenario.id} turn ${index + 1}: ${input}`);
    const result = await gamePipeline.executeTurn(input, world, index + 1, {
      agents: BUILTIN_AGENTS,
      groups,
      backends: DEFAULT_BACKENDS,
      activeGroupId: group.id,
      mockMode,
      worldDefinition: { version: 1, characterSchema: scenario.schema },
    });
    const spans = globalTraceManager.getTrace(result.traceId)?.spans || [];
    const publicContexts = spans
      .filter((s) => ["narrator", "perception"].includes(s.agentId || ""))
      .map((s) => ({ agent: s.agentId, context: s.inputContext }));
    const leaked = JSON.stringify(publicContexts).includes("PRIVATE_CANARY_");
    const valid = Object.values(result.turn.worldStateAfter.entities)
      .filter((e) => e.type === "character")
      .every(
        (e) =>
          validateCharacterAgainstSchema(
            e,
            scenario.schema,
            result.turn.worldStateAfter,
          ).valid,
      );
    const passed =
      result.success && !result.turn.narrationError && !leaked && valid;
    report.turns.push({
      input,
      success: result.success,
      passed,
      error: result.error,
      narrationError: result.turn.narrationError,
      leaked,
      valid,
      before: world.entities,
      after: result.turn.worldStateAfter.entities,
      patches: result.turn.patches,
      narration: result.turn.narratorOutput,
      agents: spans
        .filter((s) => s.agentId)
        .map((s) => ({
          agent: s.agentId,
          input: s.inputContext,
          output: s.parsedOutput,
          error: s.error,
        })),
      validation: spans
        .filter((s) => s.type.startsWith("character_"))
        .map((s) => ({
          type: s.type,
          status: s.status,
          output: s.parsedOutput,
          error: s.error,
        })),
    });
    fs.writeFileSync(
      `${outputDir}/${mockMode ? "mock" : "live"}-${scenario.id}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(
      `${scenario.id} turn ${index + 1}: passed=${passed}; patches=${result.turn.patches.length}; error=${result.error || result.turn.narrationError || "none"}`,
    );
    if (!passed) failures++;
    if (result.success) world = result.turn.worldStateAfter;
  }
}
if (failures) process.exitCode = 1;
