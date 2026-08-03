# 故事朗读普通话音色升级设计

## 目标

将故事会现有的“温柔女声”和“沉稳讲述”切换到阿里云百炼托管版 CosyVoice 3.0：

- `gentle` → `cosyvoice-v3-flash` / `longmiao_v3`（龙妙）
- `steady` → `cosyvoice-v3-flash` / `longnan_v3`（龙楠）

上海话及其他音色维持现状，其中 `dialect_shanghai` 继续使用 `qwen3-tts-flash` / `Jada`。本次不接入第三方“阿宝”音色，不部署开源 CosyVoice，不修改小程序音色选项、数据库或积分规则。

## 架构与数据流

`server/ai/aliVoiceClient.ts` 增加一个可单测的音色配置解析函数，根据应用内 `voiceType` 返回实际模型、音色、接口路径和请求参数：

1. `gentle`、`steady` 使用 CosyVoice 的 `SpeechSynthesizer` 接口，输出 WAV、24 kHz。
2. 其他音色继续使用当前 Qwen TTS 的多模态生成接口和现有映射。
3. 未知音色仍回落到 Qwen TTS 的 `Cherry`，保持兼容。

CosyVoice 模型由 `DASHSCOPE_COSYVOICE_MODEL` 配置，默认值为 `cosyvoice-v3-flash`。现有 `DASHSCOPE_TTS_MODEL` 继续只控制 Qwen TTS，不改变 ASR 配置。

`server/ai/gateway.ts` 仍是业务唯一入口。它根据解析后的配置记录实际供应商和模型，避免龙妙、龙楠请求被错误记录成 `qwen3-tts-flash`。业务路由和前端 API 契约不变，仍返回 `{ audioData, audioMime }`。

## 错误处理

- 两类请求均复用现有 `withRetry` 和超时策略。
- CosyVoice 调用失败时返回明确的合成失败错误，不静默换回其他音色，避免用户选择与实际声音不一致。
- 音频签名 URL 只在服务端下载并转换为 Base64，不写入日志。
- 日志只记录供应商、模型和耗时，不记录故事文本原文。

## 测试与验收

按测试驱动顺序实施：

1. 先增加失败测试，断言 `gentle`、`steady` 分别解析为龙妙、龙楠和 CosyVoice 接口。
2. 断言 `dialect_shanghai` 仍解析为 Jada 和 Qwen TTS 接口，其他既有映射不回退。
3. 断言网关遥测使用实际模型名称。
4. 运行相关单测及完整 `pnpm test`。
5. 使用本地真实密钥分别合成龙妙、龙楠和 Jada 小样，只报告状态、耗时与音频字节数，不显示密钥或签名 URL。
6. 运行 `pnpm build:weapp:prod`，确保生产 API 地址校验通过。
7. 提交并推送 `codex/m4-release-ready`，执行生产部署脚本并通过健康检查。

## 非目标

- 不改变上海话当前效果或音色名称。
- 不新增声音复刻、参考录音上传或 GPU 服务。
- 不修改四川话、广东话、活泼女声等其他音色。
- 不修改小程序页面布局、后端 schema、积分与幂等逻辑。
