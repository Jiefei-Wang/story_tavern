import fs from "node:fs";
import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from "../src/db/initialData";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { cloneWorldState } from "../src/engine/world/PatchEngine";

/**
 * Developer-only live evaluation. This deliberately invokes GamePipeline so
 * the report exercises Input Compiler -> Perception -> NPC Reaction -> World
 * Resolver -> Narrator, rather than testing Narrator with a hand-written plan.
 * Use `--mock` only for a local smoke test; the default is the configured live
 * backend and should be the acceptance run.
 */
function loadDotEnv(): void {
  try {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* .env is optional; AgentRuntime reports missing credentials. */ }
}

function print(label: string, value: unknown): void {
  console.log(`\n${label}\n${JSON.stringify(value, null, 2)}`);
}

async function main(): Promise<void> {
  loadDotEnv();
  const mockMode = process.argv.includes("--mock");
  const scenarios = [
    { name: "direct_question_to_npc", input: "我对艾琳说‘今晚离开这里。’" },
    { name: "physical_action_without_dialogue", input: "我走到酒馆门口，观察四周。" },
    { name: "long_response_window", input: "我问艾琳边境最近发生了什么，然后等她回答。" },
  ];
  let world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const failures: string[] = [];
  for (const scenario of scenarios) {
    try {
      console.log(`\n${"=".repeat(72)}\nScenario name: ${scenario.name}\nPlayer input: ${scenario.input}\n${"=".repeat(72)}`);
      const result = await gamePipeline.executeTurn(scenario.input, world, 1, {
        agents: BUILTIN_AGENTS,
        groups: DEFAULT_AGENT_GROUPS,
        backends: DEFAULT_BACKENDS,
        activeGroupId: "group_quality",
        mockMode,
      });
      const trace = globalTraceManager.getTrace(result.traceId);
      const spans = trace?.spans || [];
      for (const agentId of ["input_compiler", "perception", "npc_reaction", "world_resolver", "narrator"]) {
        const matching = spans.filter((span) => span.agentId === agentId);
        for (const span of matching) {
          print(`${agentId} input`, span.inputContext);
          print(`${agentId} output`, span.parsedOutput ?? span.rawResponse ?? { status: span.status, error: span.error });
        }
      }
      print("accepted intents / rejected intents / committed public events", {
        resolver: spans.filter((span) => span.agentId === "world_resolver").map((span) => span.parsedOutput),
        committedEvents: result.turn.committedEvents,
      });
      const narratorSpan = spans.find((span) => span.agentId === "narrator");
      print("Narrator structured output", narratorSpan?.parsedOutput);
      console.log(`\nFINAL TEXT\n${result.turn.narratorOutput}`);
      if (!result.success) throw new Error(result.error || result.turn.error || "unknown pipeline failure");
      world = result.turn.worldStateAfter;
    } catch (error) {
      const message = `Scenario '${scenario.name}' failed: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(message);
      console.error(message);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

main().catch((error) => {
  console.error("Narrator E2E evaluation failed:", error);
  process.exitCode = 1;
});
