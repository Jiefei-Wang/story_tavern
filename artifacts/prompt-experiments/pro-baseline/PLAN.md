# DeepSeek V4 Pro：只更换模型的原请求对照

用户要求用DeepSeek V4 Pro重跑。选择已配置后端目录中的正式版本 `deepseek/deepseek-v4-pro-0813`，模型标识核对来源：https://openrouter.ai/deepseek/deepseek-v4-pro-0813 。不使用较早的0423版本或batch接口，不改变正式unit test组。

沿用v1冻结的18个固定案例及人工预期，每个重复3次，共54次实际请求。对照是v1原提示的Flash baseline 54次。所有system/user消息、字段Schema、temperature、top_p、max_tokens和请求的reasoning_effort=none保持一致，仅将model从deepseek/deepseek-v4.1-flash改为上述Pro。请求与原始材料哈希必须匹配，模型参数只允许model差异。不重新使用此前失败的新提示，也不增加短摘要或去重输入。

每次只请求一次，无格式重试或Mock。调用错误、格式问题、人工语义错误和争议分别记录。18个案例重复3次不等于54个独立故事；这也是非同期模型比较，不能证明所有故事或完整多轮效果。保留证词疑虑和动作表达的既有争议，不为了模型排名改gold。

三位开发审阅者按角色逐份检查回复：旁白21份、旁白审查12份、编译器与人物变化审查21份。检查器说grounded/valid不等于检测正确。角色若仍漏判或对照退化，不宣称仅换模型已解决。实验不写入src或保存的Agent、模型绑定。
