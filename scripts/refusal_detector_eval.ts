import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { detectModelRefusal, effectiveBehaviorVerdict, REFUSAL_CLASSIFICATIONS, scoreRefusalDetection, type RefusalClassification } from "../src/engine/evaluation/RefusalDetector";
import { redactEvidence, type BehaviorRunConfiguration } from "../src/engine/evaluation/BehaviorEvaluation";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";

const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
for (const argument of process.argv.slice(2)) if (!/^--(?:cases|config|output)=.+$/.test(argument)) throw new Error("Use --cases=path --config=path --output=directory; live detection only.");
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch (error: any) { if (error.code !== "ENOENT") throw error; }
const secrets = Object.entries(process.env).filter(([key,value]) => /key|secret|token|password|credential/i.test(key) && !!value).map(([,value]) => value!);
const clean = <T>(value: T): T => redactEvidence(value, secrets);
const casesPath = path.resolve(option("cases") || "artifacts/behavior-tests/refusal/cases.json");
const configPath = path.resolve(option("config") || "artifacts/behavior-tests/unit-test-config.json");
const configSource = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(configSource) as BehaviorRunConfiguration;
const rawCases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
const cases: Array<{ id: string; responseText: string; gold?: RefusalClassification | null; originalStatus?: "passed" | "failed" | "manual_review_pending" | "not_exercised" }> = Array.isArray(rawCases) ? rawCases : rawCases.cases;
if (!Array.isArray(cases) || !cases.length) throw new Error("Cases file must be a nonempty array or {cases: [...]} object");
const ids = new Set<string>();
for (const sample of cases) {
  if (typeof sample.id !== "string" || !sample.id || ids.has(sample.id) || typeof sample.responseText !== "string") throw new Error("Each sample needs a unique nonempty id and responseText string");
  ids.add(sample.id);
  if (sample.gold != null && !REFUSAL_CLASSIFICATIONS.includes(sample.gold)) throw new Error(`Invalid manual gold label for ${sample.id}`);
  if (sample.originalStatus && !["passed", "failed", "manual_review_pending", "not_exercised"].includes(sample.originalStatus)) throw new Error(`Invalid originalStatus for ${sample.id}`);
}
const outputDirectory = path.resolve(option("output") || "artifacts/behavior-tests/refusal/detector");
fs.mkdirSync(outputDirectory, { recursive: true });
const report: any = {
  version: 1, mode: "live_response_only_detector", startedAt: new Date().toISOString(),
  casesSource: casesPath, configSource: configPath, configSha256: createHash("sha256").update(configSource).digest("hex"),
  groupId: "group_unit_test", samples: [],
  note: "原模型回复是唯一模型输入；id、gold、原用户输入、世界、人工理由均不提供检测Agent。金标准来自独立人工标注。",
};
const persist = () => fs.writeFileSync(path.join(outputDirectory, "results.json"), JSON.stringify(clean(report), null, 2));
persist();
for (const sample of cases) {
  const traceId = `refusal_eval_${randomUUID()}`;
  let result;
  try {
    result = await detectModelRefusal(sample.responseText, { agents: config.agents, groups: config.groups, backends: config.backends, groupId: "group_unit_test", traceId });
  } catch (error: any) {
    result = { success: false, data: null, spanId: "", error: error.message || String(error) };
  }
  const detection = result.success ? result.data : null;
  const score = scoreRefusalDetection(detection, sample.gold);
  report.samples.push({
    id: sample.id, responseText: sample.responseText, gold: sample.gold ?? null,
    detector: { success: result.success, output: detection, error: result.error },
    score,
    effectiveBehavior: effectiveBehaviorVerdict({ originalStatus: sample.originalStatus || "not_exercised", detection, gold: sample.gold }),
    trace: globalTraceManager.getTrace(traceId),
  });
  persist();
  console.log(`${sample.id}: detector=${detection?.classification || "execution_error"}; gold-score=${score.status}`);
}
report.completedAt = new Date().toISOString();
report.summary = {
  samples: report.samples.length,
  passed: report.samples.filter((sample: any) => sample.score.status === "passed").length,
  failed: report.samples.filter((sample: any) => sample.score.status === "failed").length,
  pending: report.samples.filter((sample: any) => sample.score.status === "manual_gold_pending").length,
  refusalBranchesPassed: report.samples.filter((sample: any) => sample.effectiveBehavior.status === "refusal_branch_passed").length,
};
persist();
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
else if (report.summary.pending) process.exitCode = 2;
