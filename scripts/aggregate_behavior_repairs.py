"""Join human reviews to preserved real runs; never infer semantic verdicts."""
import collections
import json
from pathlib import Path

root = Path('artifacts/behavior-tests')
targeted = {'modern-legal-item', 'promise-repair', 'station-permissions', 'delayed-recall'}
trajectory = {'modern-legal-item', 'promise-repair'}
names = ['ancient-impossible', 'modern-legal-item', 'promise-repair', 'polar-energy',
         'testimony-correction', 'diplomatic-whisper', 'station-permissions',
         'low-magic-limits', 'delayed-recall']
rows = []
sources = []
lines = ['# 修复后的逐轮人工复核', '',
         '这是按场景选择最新完整实跑的汇总，包含不同代码版本的定向复测，并非同一版本一次运行的 42 轮。原始输出、失败、中断和人工判断均保留。脚本只合并人工审阅，不调用模型判分。', '',
         '| 故事 | 结构通过/失败 | 人工整轮通过/失败/争议/未评估 | 证据与逐轮理由 |',
         '|---|---|---|---|']
for name in names:
    cohort = 'trajectory' if name in trajectory else 'targeted' if name in targeted else 'final'
    evidence = f'{cohort}-live/{name}.json'
    review = f'{cohort}-reviews/{name}.json'
    data = json.loads((root / evidence).read_text(encoding='utf8'))
    judgments = json.loads((root / review).read_text(encoding='utf8'))
    assert data.get('completedAt'), f'{name}: incomplete run'
    assert len(judgments) == len(data['turns']), f'{name}: incomplete manual review'
    for turn, judgment in zip(data['turns'], judgments):
        assert turn['turnNumber'] == judgment['turnNumber']
        assert all(judgment[key] in {'passed', 'failed', 'disputed', 'not_evaluable'}
                   for key in ['attributes', 'narration', 'overall'])
        rows.append(dict(judgment, scenario=name, phase1=turn['phase1']['status'],
                         pipelineSuccess=turn['success'], input=turn['input'],
                         evidenceFile=evidence, reviewFile=review,
                         evidencePointer=f"/turns/{turn['turnNumber']-1}"))
    subset = rows[-len(judgments):]
    c = collections.Counter(r['overall'] for r in subset)
    s = collections.Counter(r['phase1'] for r in subset)
    verdict = '/'.join(str(c[k]) for k in ['passed', 'failed', 'disputed', 'not_evaluable'])
    lines.append(f"| {name} | {s['passed']}/{s['failed']} | {verdict} | [原始记录]({evidence}) · [人工理由]({cohort}-reviews/{name}.md) |")
    sources.append(dict(scenario=name, evidenceFile=evidence, reviewFile=review,
                        configuration=data['configuration'], completedAt=data['completedAt']))
assert len(rows) == 42
summary = {key: dict(collections.Counter(row[key] for row in rows))
           for key in ['phase1', 'attributes', 'narration', 'overall', 'pipelineSuccess']}
lines.extend(['', '汇总（争议与未评估不计通过）：', '',
              '```json', json.dumps(summary, ensure_ascii=False, indent=2), '```', '',
              '各次运行的配置和代码指纹保存在 [机器可读汇总](repair-review.json) 的 sources 中。额外施法对照和拒绝分类回归单独统计，不加入原 42 轮分母。'])
(root / 'repair-review.json').write_text(json.dumps(dict(method='manual_review_of_preserved_real_runs',
    mixedRuntimeVersions=True, summary=summary, sources=sources, turns=rows), ensure_ascii=False, indent=2), encoding='utf8')
(root / 'REPAIR-MANUAL-REVIEW.md').write_text('\n'.join(lines) + '\n', encoding='utf8')
print(json.dumps(summary, ensure_ascii=False))
