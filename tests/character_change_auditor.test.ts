import test from "node:test";
import assert from "node:assert/strict";
import { auditCharacterChanges, buildCharacterChangeAuditContext, CHARACTER_CHANGE_AUDITOR, validateCharacterChangeAuditResult, type CharacterChangeAuditContext } from "../src/engine/world/CharacterChangeAuditor";

function context(): CharacterChangeAuditContext {
  const before = { type: "character" as const, name: "邻居", location: "room", attributes: { reliability: 0.4, memories: "" } };
  return {
    npcId: "neighbor", schema: { version: 1, sections: [{ id: "state", label: "状态", fields: [{ id: "reliability", label: "履约可靠性", description: "相信对方兑现承诺。一次道歉不能抵消当前失约。", type: "number", min: 0, max: 1, visibility: "private", updatePolicy: "dynamic", freedom: "strict" }, { id: "memories", label: "经历", type: "text", visibility: "private", updatePolicy: "append_only", freedom: "free" }] }] },
    before, proposedCharacter: { ...structuredClone(before), attributes: { reliability: 0.45, memories: "" } },
    recentExperiences: [{ id: "old", observation: { eventId: "old", type: "speech", actor: "player", saw: true, heard: true, content: "我保证借你一把伞" } }],
    observations: [{ eventId: "now", type: "speech", actor: "player", saw: true, heard: true, content: "我其实没有伞，刚才不该保证" }],
    proposedStateUpdates: [{ path: "attributes.reliability", op: "delta", value: 0.05, reason: "诚实坦白值得信任", sourceEventIds: ["now"] }],
    intents: [], availableTime: 5,
  };
}
const runtime = { agents: [CHARACTER_CHANGE_AUDITOR], groups: [], backends: [], groupId: "unit-test", mockMode: false };

test("independent auditor receives both loss-of-promise evidence and actual positive direction, and can reject without rewriting", async () => {
  const original = context(), saved = structuredClone(original);
  const result = await auditCharacterChanges(original, runtime, async options => {
    assert.equal(options.agentId, "character_change_auditor");
    assert.equal(options.context.audit.before.attributes.reliability, 0.4);
    assert.equal(options.context.audit.proposedCharacter.attributes.reliability, 0.45);
    assert.match(options.context.audit.recentExperiences[0].observation.content, /保证/);
    assert.match(options.context.audit.observations[0].content, /没有伞/);
    assert.match(options.instructions!, /合法updateIndex仅为 \[0\]/);
    assert(options.instructions!.includes(JSON.stringify(CHARACTER_CHANGE_AUDITOR.outputSchema)));
    return { success: true, spanId: "audit-original", data: { valid: false, issues: [{ updateIndex: 0, reason: "当前失约尚未修复，不能将坦白作为新的履约证据增加可靠性。" }] } };
  });
  assert.equal(result.success, true);
  assert.equal(result.data.valid, false);
  assert.equal(result.spanId, "audit-original");
  assert.deepEqual(original, saved);
});

test("unsupported specific history can be rejected with empty personal history without inventing a contrary fact", async () => {
  const input = context();
  input.before.attributes = { profile: "曾被旅伴耽误行程，重视准时。", memories: "" };
  input.proposedCharacter = structuredClone(input.before);
  input.recentExperiences = [];
  input.proposedStateUpdates = [];
  input.observations = [{ eventId: "now", type: "speech", actor: "player", saw: true, heard: true, content: "我会准时来。" }];
  input.intents = [{ id: "reply", type: "speech", target: "player", speechPlan: { summary: "你昨天也对我说过会准时来。", verbosity: "brief" } }];
  const saved = structuredClone(input);
  const result = await auditCharacterChanges(input, runtime, async options => {
    const audit = options.context.audit;
    assert.deepEqual(audit.recentExperiences, []);
    assert.equal(audit.before.attributes.memories, "");
    assert.equal(audit.before.attributes.profile, "曾被旅伴耽误行程，重视准时。");
    assert.equal(audit.intents[0].speechPlan.summary, "你昨天也对我说过会准时来。");
    assert.doesNotMatch(JSON.stringify(audit.before), /昨天|从未/);
    const policy = CHARACTER_CHANGE_AUDITOR.messages[0].content;
    assert.match(policy, /也拒绝没有本人可用来源却补写/);
    assert.match(policy, /历史没有记录不证明某事从未发生/);
    assert.doesNotMatch(policy, /只拒绝有明确个人证据冲突/);
    return { success: true, spanId: "unsubstantiated-history", data: { valid: false, issues: [], speechIssues: [{ intentIndex: 0, reason: "概括背景未指明玩家或昨天的承诺，不能肯定补写这段具体交往。" }] } };
  });
  assert.equal(result.success, true);
  assert.equal(result.data.valid, false);
  assert.deepEqual(result.data.issues, []);
  assert.equal(result.data.speechIssues?.[0].intentIndex, 0);
  assert.equal(result.spanId, "unsubstantiated-history");
  assert.deepEqual(input, saved);
});

test("only current NPC and perceptible personal evidence enter audit, not accidental world/global history attachments", async () => {
  const input: any = context();
  input.world = { otherNpc: "OTHER_PRIVATE_WORLD" };
  input.gold = { expected: "GOLD_EXPECTATION" };
  input.before.world = { secret: "ATTACHED_PRIVATE_WORLD" };
  input.observations.push({ eventId: "inaudible", type: "speech", heard: false, saw: false, content: "INVISIBLE_PRIVATE_CONTENT" });
  input.observations.push({ eventId: "visible_whisper", type: "speech", heard: false, saw: true, content: "UNHEARD_PRIVATE_CONTENT", world: "OBSERVATION_WORLD" });
  input.recentExperiences[0].world = "HISTORY_WORLD";
  const material = buildCharacterChangeAuditContext(input);
  assert.doesNotMatch(JSON.stringify(material), /OTHER_PRIVATE_WORLD|GOLD_EXPECTATION|ATTACHED_PRIVATE_WORLD|INVISIBLE_PRIVATE_CONTENT|UNHEARD_PRIVATE_CONTENT|OBSERVATION_WORLD|HISTORY_WORLD/);
  assert.equal(material.observations.find(observation => observation.eventId === "visible_whisper")?.content, undefined);
  assert.match(JSON.stringify(material), /我保证借你一把伞/);
});

test("unknown sources and repeated settlement are rejected before a model is called", async () => {
  const input = context();
  let calls = 0;
  const run = async () => { calls++; throw new Error("must not run"); };
  input.proposedStateUpdates[0].sourceEventIds = ["not_observed"];
  const missing = await auditCharacterChanges(input, runtime, run);
  assert.equal(missing.success, true);
  assert.equal(missing.data.valid, false);
  assert.match(missing.data.issues[0].reason, /不可感知/);
  input.proposedStateUpdates[0].sourceEventIds = ["now"];
  input.recentExperiences.push({ id: "now", observation: input.observations[0], appliedStatePaths: ["attributes.reliability"] });
  const duplicate = await auditCharacterChanges(input, runtime, run);
  assert.match(duplicate.data.issues[0].reason, /重复/);
  assert.equal(calls, 0);
});

test("conditional physiological effects retain budgeted actions and duration for independent review", async () => {
  const input = context();
  input.intents = [{ id: "eat1", type: "action", op: "eat", target: "food", duration: 300 }];
  input.availableTime = 1200;
  input.proposedStateUpdates[0].reason = "只有eat1被接受且实际进食后才结算此条件效果";
  const result = await auditCharacterChanges(input, runtime, async options => {
    assert.equal(options.context.audit.intents[0].duration, 300);
    assert.equal(options.context.audit.availableTime, 1200);
    assert.match(CHARACTER_CHANGE_AUDITOR.messages[0].content, /计划效果是条件提议/);
    assert.match(CHARACTER_CHANGE_AUDITOR.messages[0].content, /只有speech答应/);
    return { success: true, data: { valid: true, issues: [] } };
  });
  assert.equal(result.data.valid, true, "helper must not force all uncommitted planned effects to fail");
});

test("failed attempts and unverified statements remain explicit evidence, not materialized as facts", async () => {
  const input = context();
  input.observations = [{ eventId: "now", type: "action", saw: true, heard: false, op: "give", outcome: { status: "failed", summary: "尝试失败", reason: "不存在物品" } }];
  const result = await auditCharacterChanges(input, runtime, async options => {
    assert.equal(options.context.audit.observations[0].outcome.status, "failed");
    assert.match(CHARACTER_CHANGE_AUDITOR.messages[0].content, /speech只证明某人作了陈述/);
    assert.match(CHARACTER_CHANGE_AUDITOR.messages[0].content, /已失败action只证明尝试失败/);
    return { success: true, data: { valid: false, issues: [{ updateIndex: 0, reason: "引用的是失败尝试，不能作为获得帮助而增加信任。" }] } };
  });
  assert.equal(result.data.valid, false);
});

test("verdict indices, consistency and closed response are enforced without normalizing the model result", () => {
  for (const value of [
    { valid: true, issues: [{ updateIndex: 0, reason: "contradiction" }] },
    { valid: false, issues: [] },
    { valid: false, issues: [{ updateIndex: 1, reason: "unknown" }] },
    { valid: false, issues: [{ updateIndex: 0, reason: "one" }, { updateIndex: 0, reason: "two" }] },
    { valid: false, issues: [{ updateIndex: 0, reason: " " }] },
    { valid: true, issues: [], patches: [] },
  ]) assert.throws(() => validateCharacterChangeAuditResult(value, 1));
});

test("auditor protocol and service failures stay failures and preserve span IDs instead of approving or rejecting characters silently", async () => {
  const malformed = await auditCharacterChanges(context(), runtime, async () => ({ success: true, spanId: "bad-shape", data: { valid: true, issues: [{ updateIndex: 0, reason: "bad" }] } }));
  assert.equal(malformed.success, false);
  assert.equal(malformed.data, null);
  assert.equal(malformed.spanId, "bad-shape");
  const failed = await auditCharacterChanges(context(), runtime, async () => ({ success: false, spanId: "service-failed", error: "HTTP 503" }));
  assert.equal(failed.success, false);
  assert.equal(failed.error, "HTTP 503");
  assert.equal(failed.spanId, "service-failed");
});

test("an empty update set needs no model audit and does not demand invented changes", async () => {
  const input = context(); input.proposedStateUpdates = [];
  const result = await auditCharacterChanges(input, runtime, async () => { throw new Error("must not run"); });
  assert.deepEqual(result, { success: true, data: { valid: true, issues: [] }, spanId: "" });
});

test("speech-only audit checks held object and personal history and returns complete intent index", async () => {
  const input = context();
  input.proposedStateUpdates = [];
  input.proposedCharacter = structuredClone(input.before);
  input.recentExperiences = [{ id: "received", observation: { eventId: "received", type: "action", actor: "neighbor", op: "take", target: "coat", saw: true, heard: false, outcome: { status: "success", summary: "接过雨衣", reason: "已提交" } } }];
  input.visibleObjects = { coat: { type: "item", name: "雨衣", location: "neighbor", consumed: false } };
  input.intents = [{ type: "action", op: "look", duration: 1 }, { type: "speech", content: "刚才没接到雨衣" }];
  const result = await auditCharacterChanges(input, runtime, async options => {
    assert.equal(options.context.audit.visibleObjects.coat.location, "neighbor");
    assert.equal(options.context.audit.recentExperiences[0].observation.outcome.status, "success");
    assert.equal(options.context.audit.intents[1].content, "刚才没接到雨衣");
    assert.match(options.instructions!, /合法speechIssues.intentIndex仅为 \[1\]/);
    return { success: true, spanId: "speech-only", data: { valid: false, issues: [], speechIssues: [{ intentIndex: 1, reason: "已接过且当前持有雨衣，无动机却声称未收到。" }] } };
  });
  assert.equal(result.success, true);
  assert.equal(result.data.valid, false);
  assert.equal(result.data.speechIssues?.[0].intentIndex, 1);
  assert.equal(result.spanId, "speech-only");
});

test("visible object context excludes other minds, remote or held objects and arbitrary attached secrets", () => {
  const input = context();
  input.visibleObjects = {
    owned: { type: "item", name: "已知物品", location: "neighbor", loaded: false, attributes: { secret: "OBJECT_SECRET" }, world: "ATTACHED_WORLD" },
    nearby: { type: "object", name: "桌子", location: "room", open: true },
    other: { type: "character", location: "room", attributes: { secret: "OTHER_MIND" } },
    remote: { type: "item", location: "elsewhere", name: "REMOTE_ITEM" },
    held: { type: "item", location: "someone_else", name: "HELD_ITEM" },
    malformed: { type: "item", location: "room", name: { secret: "OBJECT_NAME_TREE" } },
  };
  const result = buildCharacterChangeAuditContext(input);
  assert.doesNotMatch(JSON.stringify(result), /OBJECT_SECRET|ATTACHED_WORLD|OTHER_MIND|REMOTE_ITEM|HELD_ITEM|OBJECT_NAME_TREE/);
  assert.deepEqual((result.visibleObjects?.owned as any), { type: "item", name: "已知物品", location: "neighbor", loaded: false });
  assert.equal((result.visibleObjects?.nearby as any).open, true);
});

test("speech verdict shape rejects action indices, duplicates and conflicting valid while old verdict stays compatible", () => {
  for (const value of [
    { valid: true, issues: [], speechIssues: [{ intentIndex: 1, reason: "contradiction" }] },
    { valid: false, issues: [], speechIssues: [{ intentIndex: 0, reason: "action index" }] },
    { valid: false, issues: [], speechIssues: [{ intentIndex: 1, reason: "one" }, { intentIndex: 1, reason: "two" }] },
    { valid: false, issues: [], speechIssues: [{ intentIndex: 1, reason: " " }] },
    { valid: false, issues: [], speechIssues: [{ intentIndex: 1, reason: "reason", rewrite: "no" }] },
  ]) assert.throws(() => validateCharacterChangeAuditResult(value, 0, [1]));
  assert.deepEqual(validateCharacterChangeAuditResult({ valid: true, issues: [] }, 0, [1]), { valid: true, issues: [] });
});

test("known source violations do not suppress independent speech inspection", async () => {
  const input = context();
  input.proposedStateUpdates[0].sourceEventIds = ["not_observed"];
  input.intents = [{ type: "speech", content: "与记忆冲突的陈述" }];
  const result = await auditCharacterChanges(input, runtime, async () => ({ success: true, data: { valid: false, issues: [], speechIssues: [{ intentIndex: 0, reason: "本人已知历史与本句矛盾。" }] } }));
  assert.equal(result.data.issues.length, 1);
  assert.equal(result.data.speechIssues?.length, 1);
  assert.equal(result.data.valid, false);
});

test("phase and actual completed process evidence are preserved; motivated deception is not blanket forbidden", async () => {
  const input = context();
  input.observations = [{ eventId: "now", type: "action", actor: "neighbor", op: "rest", duration: 600, saw: true, heard: false, outcome: { status: "success", summary: "已经完成休息", reason: "已提交的实际过程" } }];
  for (const phase of ["reaction", "completed_process"] as const) {
    input.phase = phase;
    await auditCharacterChanges(input, runtime, async options => {
      assert.equal(options.context.audit.phase, phase);
      assert.equal(options.context.audit.observations[0].duration, 600);
      assert.match(options.instructions!, /reaction禁止预支/);
      assert.match(options.instructions!, /completed_process仅评真实已完成过程/);
      return { success: true, data: { valid: true, issues: [], speechIssues: [] } };
    });
  }
  assert.match(CHARACTER_CHANGE_AUDITOR.messages[0].content, /有意撒谎/);
  assert.match(CHARACTER_CHANGE_AUDITOR.messages[0].content, /正常省略不是矛盾/);
  assert.throws(() => buildCharacterChangeAuditContext({ ...input, phase: "unknown" as any }));
});
