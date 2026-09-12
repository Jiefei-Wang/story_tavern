# 修复后的逐轮人工复核

这是按场景选择最新完整实跑的汇总，包含不同代码版本的定向复测，并非同一版本一次运行的 42 轮。原始输出、失败、中断和人工判断均保留。脚本只合并人工审阅，不调用模型判分。

| 故事 | 结构通过/失败 | 人工整轮通过/失败/争议/未评估 | 证据与逐轮理由 |
|---|---|---|---|
| ancient-impossible | 3/0 | 2/0/1/0 | [原始记录](final-live/ancient-impossible.json) · [人工理由](final-reviews/ancient-impossible.md) |
| modern-legal-item | 2/2 | 0/4/0/0 | [原始记录](trajectory-live/modern-legal-item.json) · [人工理由](trajectory-reviews/modern-legal-item.md) |
| promise-repair | 6/0 | 5/1/0/0 | [原始记录](trajectory-live/promise-repair.json) · [人工理由](trajectory-reviews/promise-repair.md) |
| polar-energy | 4/0 | 3/0/1/0 | [原始记录](final-live/polar-energy.json) · [人工理由](final-reviews/polar-energy.md) |
| testimony-correction | 4/0 | 3/1/0/0 | [原始记录](final-live/testimony-correction.json) · [人工理由](final-reviews/testimony-correction.md) |
| diplomatic-whisper | 4/0 | 2/0/2/0 | [原始记录](final-live/diplomatic-whisper.json) · [人工理由](final-reviews/diplomatic-whisper.md) |
| station-permissions | 6/0 | 2/3/1/0 | [原始记录](targeted-live/station-permissions.json) · [人工理由](targeted-reviews/station-permissions.md) |
| low-magic-limits | 3/0 | 1/0/1/1 | [原始记录](final-live/low-magic-limits.json) · [人工理由](final-reviews/low-magic-limits.md) |
| delayed-recall | 8/0 | 6/2/0/0 | [原始记录](targeted-live/delayed-recall.json) · [人工理由](targeted-reviews/delayed-recall.md) |

汇总（争议与未评估不计通过）：

```json
{
  "phase1": {
    "passed": 40,
    "failed": 2
  },
  "attributes": {
    "passed": 37,
    "not_evaluable": 2,
    "disputed": 1,
    "failed": 2
  },
  "narration": {
    "passed": 29,
    "disputed": 5,
    "failed": 7,
    "not_evaluable": 1
  },
  "overall": {
    "passed": 24,
    "disputed": 6,
    "failed": 11,
    "not_evaluable": 1
  },
  "pipelineSuccess": {
    "true": 41,
    "false": 1
  }
}
```

各次运行的配置和代码指纹保存在 [机器可读汇总](repair-review.json) 的 sources 中。额外施法对照和拒绝分类回归单独统计，不加入原 42 轮分母。
