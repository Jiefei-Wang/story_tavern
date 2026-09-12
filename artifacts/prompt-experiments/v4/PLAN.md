# 单变量对照：草稿不能证明自己

代码阅读发现 `renderNarratorSegments` 在审查前把生成对白写入事件的 `realizedText`，同一事件又进入审查输入的公开证据区。原请求中的待审旁白本来已有这些文字。这里测试重复的草稿是否被误当成独立事实。

本轮4个旁白审查原请求，各3次，共12调用。全部system消息、生成参数、原输出Schema与v1 baseline逐字相同，不使用v2的摘要输出。只从user消息的committedEvents JSON删除顶层 `realizedText`；待审narration、speechPlan、实体、Patch、其余事件字段完全保留。有两个案例本来没有该字段，可作为不应受该改动影响的对照。

因此这是输入证据来源的隔离实验，不是再次更换提示或模型。manifest中candidate为原system，仅清理已知草稿副本；脚本保留原数据并核验替换位置。正式src及保存配置不变。若检测结果没有改善，不能声称此项足以解释漏判；即使有改善，也不倒推它解释了没有realizedText的其他错误。
