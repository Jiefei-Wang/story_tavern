import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = 'artifacts/prompt-experiments';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sourceFiles = fs.readdirSync('src', { recursive: true }).map(String).filter(x => /\.(?:ts|tsx)$/.test(x)).sort();
const sourceHash = hash(sourceFiles.map(file => `${file.replaceAll('\\', '/')}\n${fs.readFileSync(path.join('src', file), 'utf8')}`).join('\n'));
const summary: any = { method: 'manual_review_of_individual_replayed_responses', repeatsPerCase: 3,
  note: 'Requests are repeated fixed cases, not independent stories. v3/v4 use subsets and are not directly comparable with 18-case totals. No production deployment.',
  productionSourceUnchanged: true, productionSourceSHA256: sourceHash, stages: [], totalCalls: 0 };
for (const version of ['v1', 'v2', 'v3', 'v4']) {
  const dir = path.join(root, version);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const completed = JSON.parse(fs.readFileSync(path.join(dir, 'completed.json'), 'utf8'));
  assert.equal(sourceHash, manifest.productionSourceSHA256);
  assert.equal(sourceHash, completed.productionSourceSHA256);
  const configHash = hash(fs.readFileSync('artifacts/behavior-tests/unit-test-config.fixed.json'));
  assert.equal(configHash, manifest.configSHA256);
  for (const sample of manifest.cases) assert.equal(hash(fs.readFileSync(sample.sourceFile)), sample.sourceSha256);
  const reviews = fs.readdirSync(dir).filter(f => /^(?:narration|auditor|reasoning)-review\.json$/.test(f))
    .flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const responses = fs.readdirSync(path.join(dir, 'responses')).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, 'responses', f), 'utf8')));
  assert.equal(responses.length, completed.calls);
  assert.equal(reviews.length, responses.length, `${version}: incomplete human review`);
  const keys = new Set();
  for (const review of reviews) {
    const key = `${review.caseId}.${review.arm}.${review.repeat}`;
    assert(!keys.has(key)); keys.add(key);
    assert(responses.some(r => `${r.caseId}.${r.arm}.${r.repeat}` === key));
  }
  const groups: any[] = [];
  for (const arm of manifest.arms) for (const role of [...new Set(manifest.cases.map((c: any) => c.role))]) {
    const selected = reviews.filter(r => r.arm === arm && manifest.cases.find((c: any) => c.id === r.caseId).role === role);
    const count = (status: string) => selected.filter(r => r.status === status).length;
    const calls = responses.filter(r => r.arm === arm && r.role === role);
    groups.push({ arm, role, responses: selected.length, passed: count('passed'), failed: count('failed'),
      disputed: count('disputed'), not_evaluable: count('not_evaluable'),
      protocolPassed: calls.filter(r => r.result.success).length });
  }
  summary.stages.push({ version, cases: manifest.cases.length, calls: completed.calls, groups });
  summary.totalCalls += completed.calls;
}
assert.equal(summary.totalCalls, 198);
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
