# 识花草视觉快通道与两段式交互设计

日期：2026-08-04
分支：`codex/m4-release-ready`

## 1. 目标与范围

本轮把生活助手中的“识花草”从一次长耗时视觉生成拆成“快速识别 + 按需详情”两段：

- 第一段只看图片，返回植物名称、俗名、一句话简介及必要的毒性或致敏提示，成功后扣 1 积分；
- 第二段只按植物名称生成养护要点、花期习性和寓意典故，不再读取图片，也不扣积分；
- 正常视觉识别以 20 秒内返回为目标，供应商异常时允许回落 Kimi，回落路径可能超过 20 秒，前端在 30 秒后改用诚实的慢速提示；
- 本轮仅切换识花草视觉链路，菜品拍照分析继续固定使用 Kimi；
- 不增加数据库表，不改变现有积分表结构，不记录用户图片地址、模型输入或模型输出原文。

## 2. 模型与配置

新增 DashScope OpenAI 兼容视觉客户端，默认调用：

- Base URL：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 模型：`qwen3.7-flash-2026-07-15`
- API Key：继续复用 `DASHSCOPE_API_KEY`
- `enable_thinking=false`
- `response_format={"type":"json_object"}`
- `max_tokens=180`
- 单次请求超时 18 秒，不在 DashScope 客户端内做指数退避重试；失败交给网关立即回落，避免重试吃掉 20 秒目标预算。

新增配置：

- `DASHSCOPE_COMPATIBLE_BASE_URL`：默认上述兼容接口地址，避免和语音所用的原生 `DASHSCOPE_BASE_URL` 混用；
- `DASHSCOPE_VL_MODEL`：默认 `qwen3.7-flash-2026-07-15`；
- `AI_VISION_FAST_PROVIDER`：默认 `auto`，支持 `dashscope` 或 `kimi`。

`auto` 模式在存在 `DASHSCOPE_API_KEY` 时优先 DashScope，否则使用 Kimi。DashScope 调用失败时，无论是 `auto` 还是显式 `dashscope`，均回落 Kimi；显式 `kimi` 时直接走 Kimi。

## 3. 服务端结构与数据流

### 3.1 视觉客户端与网关

新增 `server/ai/dashscopeVisionClient.ts`，职责仅包括：构造 OpenAI 兼容多模态消息、发送请求、提取文本响应和执行单次超时控制。

在 `server/ai/gateway.ts` 新增独立的 `vision-fast` 能力入口，不改变既有 `aiChat` 的图像路由语义。该入口负责：

1. 根据 `AI_VISION_FAST_PROVIDER` 与密钥状态选择供应商；
2. 调用 DashScope 快通道；
3. DashScope 失败时调用 Kimi 视觉；
4. 返回文本以及实际 provider、model、是否回落和模型调用耗时；
5. 更新请求级 AI 元数据，供现有请求日志记录最终 provider 与 model。

菜品图片仍通过现有 `aiChat({ imageUrl })` 进入 Kimi，不调用新入口。

### 3.2 植物服务

识别服务使用精简提示词，只允许输出如下对象根结构：

```json
{
  "name": "月季",
  "commonNames": ["月月红"],
  "summary": "常见的蔷薇科观赏花卉，花期较长。",
  "safetyNotice": "枝条有刺，接触时注意防护。"
}
```

字段约束：

- `name` 必须是简短中文名；
- `commonNames` 最多 3 项，可为空数组；
- `summary` 只允许一句话；
- `safetyNotice` 仅在存在毒性、刺激、尖刺或常见致敏风险时返回，否则为空字符串；
- 服务端对字段类型、长度和数组数量做二次校验，解析失败按本次供应商失败处理。

详情服务接收识别结果中的规范化名称，仅通过纯文本快通道生成：

```json
{
  "carePoints": ["……"],
  "floweringAndHabits": ["……"],
  "meaningAndStories": ["……"]
}
```

每组最多 4 项。详情提示词限定为通用植物知识，不提供医疗用途、食用安全结论或治疗建议。

### 3.3 HTTP 接口与计费

`POST /api/mp/life/identify` 保持现有地址和本人上传图片校验：

- 请求：`{ sourceFileKey }`
- 返回：识别结果、`credits`、实际 provider/model、是否回落和服务端识别耗时；
- 使用现有幂等操作 ID；
- 仅识别成功后通过 `withCreditCharge` 扣 1 积分；
- 为旧体验版兼容，额外保留 `title=name`、`description=summary`、`tags=[]`、`details=[]`。

新增 `POST /api/mp/life/plant-details`：

- 请求：`{ plantName }`，去空格后长度必须为 1 至 80 字；
- 返回上述三组详情；
- 不调用 `withCreditCharge`，不扣积分；
- 前端仍使用 `retry: "never"`，失败后由用户手动重试；
- 不接受图片 URL、fileKey 或任意长文本，避免形成无约束免费文本生成入口。

识别路由在 `finally` 中记录结构化日志：`userId`、`provider`、`model`、`fallbackUsed`、`durationMs`、`success`。日志不包含 fileKey、图片 URL、提示词或模型响应。

## 4. 小程序交互

### 4.1 图片压缩

识花草选择图片时只请求微信压缩模式 `sizeType: ["compressed"]`。上传前：

1. 使用 `Taro.getImageInfo` 读取宽高；
2. 若最长边不超过 1280px，直接使用微信返回的压缩图；
3. 若超过 1280px，按原比例计算目标尺寸并调用 `Taro.compressImage`，设置 `compressedWidth`、`compressedHeight` 与适中的 JPEG 质量；
4. 压缩后重新读取尺寸并确认最长边不超过 1280px；
5. 压缩或校验失败时显示大字错误提示，不上传超规格图片。

菜品拍照维持原选择和上传流程，不套用 1280px 限制。

### 4.2 第一段结果

第一段成功后立即显示：

- 用户照片；
- 大字中文名称；
- 俗名（存在时）；
- 一句话简介；
- 醒目的毒性/致敏/尖刺提示（存在时）；
- “了解更多”全宽大按钮；
- “继续使用生活助手”按钮与 AIGC 标识。

第一段不再预生成养护详情。

### 4.3 第二段详情

用户点击“了解更多”后调用 `/life/plant-details`。等待时保留已识别结果，并在按钮区域显示短等待态。返回后按“养护要点”“花期习性”“寓意典故”三组大字卡片展开。“了解更多”失败不影响已经完成并扣分的识别结果，用户可手动重试详情请求。

### 4.4 等待文案

扩展 `GenerationProgress` 的通用状态格式能力：

- 0 至 29 秒：`正在辨认…已用 X 秒，通常20秒内`；
- 30 秒及以上：`网络有点慢，再等等…已用 X 秒`；
- 详情段使用短等待提示，不宣称固定秒数；
- 组件继续负责生成期间防息屏，并在完成、隐藏或卸载时恢复。

## 5. 错误处理

- DashScope 缺密钥：`auto` 直接选择 Kimi；
- DashScope 超时、429、5xx、空响应或无效 JSON：立即回落 Kimi；
- Kimi 也失败：使用现有统一大字错误态和手动重试，不自动重复生成；
- 压缩失败：不上传、不扣分，提示重新选择；
- 详情失败：不扣分、不清空第一段结果，可手动重试；
- 页面离开或任务结束时恢复屏幕常亮状态。

## 6. 测试与验收

自动化测试覆盖：

1. DashScope 请求体包含准确模型、图片、JSON 模式、关闭思考及 180 token 上限；
2. `vision-fast` 的 `auto` 选择、显式覆盖、缺密钥选择和 DashScope→Kimi 回落；
3. 菜品拍照仍走 Kimi；
4. 识别 JSON 校验、短字段和安全提示可空；
5. `/life/identify` 只在成功后扣 1 积分，并保留旧字段；
6. `/life/plant-details` 不看图、不扣积分、输入受限；
7. 图片最长边计算、1280px 压缩与压缩失败阻断；
8. 等待文案在 29/30 秒边界切换且不保留矛盾预估；
9. 小程序类型检查、生产构建及生产 API 地址校验；
10. 全仓测试通过，且不修改开发者工具私有配置。

部署后使用生产真实密钥，对“花朵近拍、整株、树叶”三张代表图执行真实服务端链路测试，分别记录 provider、model、是否回落和识别耗时，并与原 66 秒以上基线对比。由于自动化环境不能操作物理手机，上传、弱网和真机渲染的端到端耗时由用户上传新体验版后复核，交付报告必须明确这一边界，不得把开发者工具或服务端实调表述为真机验收。

## 7. 发布流程

1. 先完成测试驱动开发并运行相关测试；
2. 运行全仓 `pnpm test` 与必要的类型检查；
3. 将本地非密钥配置同步到本地 `.env`，安全确认服务器已有 `DASHSCOPE_API_KEY`，不得回显值；
4. 推送 `codex/m4-release-ready`；
5. 通过 `scripts/deploy/02-deploy.sh` 更新生产服务器；
6. `curl https://api.hxzhineng.xyz/api/mp/health` 验证服务；
7. 执行三图真实密钥实调并汇总耗时；
8. 运行 `pnpm build:weapp:prod`，确认生产地址校验通过；
9. 汇报提交号、测试、部署健康检查、三图耗时及真机待复核项。
