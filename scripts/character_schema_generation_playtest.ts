import fs from "node:fs";
import { scenarios, worldFor } from "../tests/fixtures/characterWorlds";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
} from "../tests/fixtures/legacyInitialData";
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
const outputDir =
  process.env.CHARACTER_EVAL_OUTPUT || "artifacts/character-schema/generation";
fs.mkdirSync(outputDir, { recursive: true });
const results = await Promise.all(
  scenarios.map(async (scenario) => {
    const world = worldFor(scenario.schema);
    world.entities.erin.attributes!.privateNote =
      "PRIVATE_EXISTING_NPC_ISOLATION";
    world.scene.description = "PRIVATE_MAIN_PLOT_ISOLATION";
    world.rules.plot = "PRIVATE_MAIN_PLOT_ISOLATION";
    const input =
      "admin:在当前房间新增一位此前从未认识的成年旅人，只创建人物，不改变其他人物，不编造对白。";
    const result = await gamePipeline.executeTurn(input, world, 1, {
      agents: BUILTIN_AGENTS,
      groups: DEFAULT_AGENT_GROUPS,
      backends: DEFAULT_BACKENDS,
      activeGroupId: "group_fast",
      mockMode: false,
      worldDefinition: { version: 1, characterSchema: scenario.schema },
    });
    const spans = globalTraceManager.getTrace(result.traceId)?.spans || [];
    const generator = spans.find((s) => s.agentId === "character_generator");
    const created = Object.entries(result.turn.worldStateAfter.entities).filter(
      ([id, e]) => e.type === "character" && !world.entities[id],
    );
    const isolated =
      !!generator &&
      !/PRIVATE_EXISTING_NPC_ISOLATION|PRIVATE_MAIN_PLOT_ISOLATION/.test(
        JSON.stringify(generator.inputContext),
      );
    const passed =
      result.success &&
      !result.turn.narrationError &&
      isolated &&
      created.length === 1 &&
      created.every(
        ([, e]) =>
          validateCharacterAgainstSchema(
            e,
            scenario.schema,
            result.turn.worldStateAfter,
          ).valid && Object.keys(e.relationships || {}).length === 0,
      );
    const report = {
      scenario: scenario.id,
      mode: "live",
      input,
      passed,
      error: result.error,
      narrationError: result.turn.narrationError,
      isolated,
      created,
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
          status: s.status,
          output: s.parsedOutput,
          error: s.error,
        })),
    };
    fs.writeFileSync(
      `${outputDir}/${scenario.id}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(
      `${scenario.id} generation passed=${passed}; created=${created.map(([, e]) => e.name).join(",")}; error=${result.error || result.turn.narrationError || "none"}`,
    );
    return passed;
  }),
);
if (results.some((p) => !p)) process.exitCode = 1;
