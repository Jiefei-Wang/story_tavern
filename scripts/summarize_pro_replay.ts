import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = 'artifacts/prompt-experiments';
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const original = read(`${root}/v1/manifest.json`);
const pro = read(`${root}/pro-baseline/manifest.json`);
const files = fs.readdirSync('src', { recursive: true }).map(String).filter(x => /\.(?:ts|tsx)$/.test(x)).sort();
assert.equal(hash(files.map(f => `${f.replaceAll('\\', '/')}\n${fs.readFileSync(path.join('src', f), 'utf8')}`).join('\n')), pro.productionSourceSHA256);
assert.equal(hash(fs.readFileSync('artifacts/behavior-tests/unit-test-config.fixed.json')), pro.configSHA256);
assert.equal(hash(fs.readFileSync(`${root}/v1/cases.json`)), hash(fs.readFileSync(`${root}/pro-baseline/cases.json`)));
for (const c of pro.cases) {
  const old = original.cases.find((x: any) => x.id === c.id);
  assert.deepEqual(c.requests.baseline, old.requests.baseline);
  assert.equal(c.commonOutputSchemaSHA256, old.commonOutputSchemaSHA256);
  assert.equal(hash(fs.readFileSync(c.sourceFile)), c.sourceSha256);
  assert.deepEqual(c.replayParams, { ...c.originalParams, model: pro.modelOverride });
}
const stages = ['v1', 'pro-baseline'].map(version => {
  const dir = `${root}/${version}`;
  const reviews = ['narration', 'auditor', 'reasoning'].flatMap(n => read(`${dir}/${n}-review.json`)).filter(r => r.arm === 'baseline');
  const responses = fs.readdirSync(`${dir}/responses`).filter(f => f.endsWith('.json')).map(f => read(`${dir}/responses/${f}`)).filter(r => r.arm === 'baseline');
  assert.equal(responses.length, 54); assert.equal(reviews.length, 54);
  const keys = new Set(reviews.map(r => `${r.caseId}.${r.repeat}`)); assert.equal(keys.size, 54);
  for (const r of responses) {
    assert(keys.has(`${r.caseId}.${r.repeat}`));
    if (version === 'pro-baseline') {
      const c = pro.cases.find((c: any) => c.id === r.caseId);
      assert.deepEqual(r.trace.spans[0].resolvedMessages, c.requests.baseline);
      assert.deepEqual(r.trace.spans[0].requestParams, c.replayParams);
    }
  }
  const tally = (rows: any[], calls: any[]) => ({ total: rows.length,
    passed: rows.filter(r => r.status === 'passed').length,
    failed: rows.filter(r => r.status === 'failed').length,
    disputed: rows.filter(r => r.status === 'disputed').length,
    not_evaluable: rows.filter(r => r.status === 'not_evaluable').length,
    protocolPassed: calls.filter(r => r.result.success).length });
  return { version, model: version === 'v1' ? pro.cases[0].originalParams.model : pro.modelOverride,
    ...tally(reviews, responses),
    rawEntireContentJson: responses.filter(r => { try { JSON.parse(r.trace.spans[0].rawResponse?.choices?.[0]?.message?.content ?? ''); return true; } catch { return false; } }).length,
    roles: [...new Set(pro.cases.map((c: any) => c.role))].map(role => ({role, ...tally(reviews.filter(r => pro.cases.find((c: any) => c.id === r.caseId).role === role), responses.filter(r => r.role === role))})),
    cases: pro.cases.map((c: any) => ({id: c.id, ...tally(reviews.filter(r => r.caseId === c.id), responses.filter(r => r.caseId === c.id))})),
    reportedReasoningTokens: responses.reduce((s, r) => s + (r.trace.spans[0].rawResponse?.usage?.completion_tokens_details?.reasoning_tokens ?? 0), 0),
    missingReasoningTokenCounts: responses.filter(r => r.trace.spans[0].rawResponse?.usage?.completion_tokens_details?.reasoning_tokens == null).length,
  };
});
const summary = { method: 'Same 18 frozen requests, three repetitions each, original prompts. Only model changed. Manual review; disputed evidence retained. No full-pipeline claim.',
  verified: { productionSourceUnchanged: true, originalEvidenceUnchanged: true, unitTestConfigurationUnchanged: true, messagesAndSchemaUnchanged: true, parametersOnlyModelChanged: true }, stages };
fs.writeFileSync(`${root}/pro-baseline/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
