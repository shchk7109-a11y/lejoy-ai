# Plant Identification Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将识花草改造成以 Qwen3.7 Flash 为默认视觉快通道的两段式流程，使正常识别目标时延进入 20 秒内，并把养护详情改成不扣积分的按需纯文本请求。

**Architecture:** 新建独立 DashScope 视觉客户端和植物领域服务，网关新增 `aiVisionFast` 能力而不改变既有 `aiChat` 图像路由，确保菜品拍照继续走 Kimi。小程序在上传前将识花图片等比压缩至最长边 1280px，第一段展示简短识别结果，第二段按植物名称调用 DeepSeek 展开详情。

**Tech Stack:** TypeScript、Express、Vitest、Axios、Taro 4、React 18、微信小程序、DashScope OpenAI 兼容 API、DeepSeek、Kimi、PM2。

---

## 文件结构

- Create `server/ai/dashscopeVisionClient.ts`：只负责 DashScope OpenAI 兼容视觉请求。
- Create `server/ai/dashscopeVisionClient.test.ts`：锁定请求体、模型、超时和短输出参数。
- Modify `server/_core/env.ts`：新增视觉兼容地址、模型和供应商配置。
- Modify `server/ai/gateway.ts`：增加 `pickFastVisionProvider` 与 `aiVisionFast`，实现 DashScope→Kimi 回落。
- Create `server/ai/gateway-vision-fast.test.ts`：覆盖选择、回落、元数据及菜品现有路由隔离。
- Create `server/plant-identification.ts`：定义短识别/详情类型、提示词、解析和字段校验。
- Create `server/plant-identification.test.ts`：覆盖短 JSON、详情 JSON、安全字段和解析失败。
- Modify `server/mp/m3-routes.ts`：接入两段式服务、计费边界和安全日志。
- Modify `server/mp/m3-routes.test.ts`：覆盖识别扣分、兼容字段、详情不扣分及输入限制。
- Modify `miniprogram/src/services/api.ts`：新增植物识别与详情响应类型及 API。
- Create `miniprogram/src/pages/life-assistant/image-compression.ts`：封装最长边计算和微信压缩流程。
- Create `server/mp/plant-image-compression.test.ts`：对纯尺寸计算与页面契约做回归测试。
- Modify `miniprogram/src/components/GenerationProgress/state.ts`：支持超过阈值切换诚实文案。
- Modify `miniprogram/src/components/GenerationProgress/index.tsx`：增加慢速阈值属性。
- Modify `server/mp/generation-progress.test.ts`：覆盖 29/30 秒边界。
- Modify `miniprogram/src/pages/life-assistant/index.tsx`：接入压缩、两段式状态和详情按钮。
- Modify `miniprogram/src/pages/life-assistant/index.scss`：新增安全提示、俗名和详情分组的大字样式。
- Create `scripts/verify-plant-vision.ts`：使用三张代表图执行真实密钥视觉链路并输出无敏感信息的耗时报告。
- Modify `.env`（不提交）：本地设置视觉模型和供应商。
- Modify `/opt/lejoy-ai/.env`（不提交）：服务器设置相同非密钥配置，不回显密钥。

### Task 1: DashScope 视觉客户端与配置

**Files:**
- Create: `server/ai/dashscopeVisionClient.test.ts`
- Create: `server/ai/dashscopeVisionClient.ts`
- Modify: `server/_core/env.ts`

- [ ] **Step 1: 写失败测试，锁定请求体与 18 秒预算**

在 `server/ai/dashscopeVisionClient.test.ts` mock `axios.post` 和 `ENV`，断言：

```ts
expect(post).toHaveBeenCalledWith(
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  expect.objectContaining({
    model: "qwen3.7-flash-2026-07-15",
    max_tokens: 180,
    enable_thinking: false,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "https://cdn.example/flower.jpg" } },
        { type: "text", text: expect.stringContaining("JSON") },
      ],
    }],
  }),
  expect.objectContaining({ timeout: 18_000 }),
);
```

同时断言客户端缺少 `DASHSCOPE_API_KEY`、响应为空时抛出明确错误，且 `withRetry` 配置 `maxRetries: 0`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- server/ai/dashscopeVisionClient.test.ts`

Expected: FAIL，提示模块 `dashscopeVisionClient` 不存在。

- [ ] **Step 3: 增加环境配置与最小客户端实现**

在 `server/_core/env.ts` 增加：

```ts
dashscopeCompatibleBaseUrl: process.env.DASHSCOPE_COMPATIBLE_BASE_URL
  ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
dashscopeVlModel: process.env.DASHSCOPE_VL_MODEL ?? "qwen3.7-flash-2026-07-15",
aiVisionFastProvider: process.env.AI_VISION_FAST_PROVIDER ?? "auto",
```

在客户端导出：

```ts
export async function dashscopeVisionChat(params: {
  imageUrl: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  timeout?: number;
}): Promise<string>
```

请求体固定使用图片 URL + 文本两段内容、`enable_thinking: false`、JSON 模式和 180 tokens；调用 `withRetry(fn, { maxRetries: 0, label: "DashScope Vision" })`。

- [ ] **Step 4: 运行客户端测试**

Run: `pnpm test -- server/ai/dashscopeVisionClient.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交客户端**

```bash
git add server/_core/env.ts server/ai/dashscopeVisionClient.ts server/ai/dashscopeVisionClient.test.ts
git commit -m "feat: add dashscope fast vision client"
```

### Task 2: 网关 vision-fast 路由与 Kimi 回落

**Files:**
- Create: `server/ai/gateway-vision-fast.test.ts`
- Modify: `server/ai/gateway.ts`

- [ ] **Step 1: 写失败测试覆盖供应商选择与回落**

测试 `pickFastVisionProvider`：

```ts
expect(pickFastVisionProvider("auto", { dashscope: true, moonshot: true })).toBe("dashscope");
expect(pickFastVisionProvider("auto", { dashscope: false, moonshot: true })).toBe("kimi");
expect(pickFastVisionProvider("kimi", { dashscope: true, moonshot: true })).toBe("kimi");
```

测试 `aiVisionFast` 在 DashScope 成功时返回：

```ts
{
  content: "{...}",
  provider: "dashscope",
  model: "qwen3.7-flash-2026-07-15",
  fallbackUsed: false,
  durationMs: expect.any(Number),
}
```

再让 DashScope mock 抛错，断言 Kimi 收到 data URL 图片、`maxTokens: 180`、`json: true`，返回 provider=`kimi` 和 `fallbackUsed=true`。保留一条 `aiChat({ imageUrl })` 测试，断言它仍直接走 Kimi。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- server/ai/gateway-vision-fast.test.ts`

Expected: FAIL，提示导出不存在。

- [ ] **Step 3: 实现选择器和快通道**

在 `gateway.ts` 增加：

```ts
export type FastVisionProvider = "dashscope" | "kimi";

export function pickFastVisionProvider(setting: string, keys: ProviderKeys): FastVisionProvider {
  if (setting !== "auto") return setting as FastVisionProvider;
  return keys.dashscope ? "dashscope" : "kimi";
}

export type FastVisionResult = {
  content: string;
  provider: FastVisionProvider;
  model: string;
  fallbackUsed: boolean;
  durationMs: number;
};
```

`aiVisionFast` 接收 `systemPrompt`、`userPrompt`、`imageUrl`、`maxTokens`；DashScope 失败后只记录错误类别，不记录消息或 URL，然后调用 Kimi。每次实际调用前用 `recordAiRequestMetadata` 写入对应 provider/model，回落时覆盖为最终供应商。

- [ ] **Step 4: 运行网关测试及既有轻文本测试**

Run: `pnpm test -- server/ai/gateway-vision-fast.test.ts server/ai/gateway-fast.test.ts`

Expected: PASS，且既有带图 `aiChat` 仍为 Kimi。

- [ ] **Step 5: 提交网关路由**

```bash
git add server/ai/gateway.ts server/ai/gateway-vision-fast.test.ts
git commit -m "feat: route plant vision through fast provider"
```

### Task 3: 植物识别与详情领域服务

**Files:**
- Create: `server/plant-identification.test.ts`
- Create: `server/plant-identification.ts`

- [ ] **Step 1: 写失败测试定义两段 JSON 契约**

mock `aiVisionFast` 和 `aiChat`，覆盖：

```ts
await expect(identifyPlantFast("https://cdn.example/flower.jpg")).resolves.toMatchObject({
  name: "月季",
  commonNames: ["月月红"],
  summary: "常见的蔷薇科观赏花卉，花期较长。",
  safetyNotice: "枝条有刺，接触时注意防护。",
  provider: "dashscope",
});
```

断言视觉请求 `maxTokens: 180` 且提示词只要求四个短字段。对名称过长、俗名超过 3 个、简介不是字符串、无效 JSON 分别断言抛出“植物识别结果解析失败，请重试”。

详情测试断言调用：

```ts
aiChat({
  systemPrompt: expect.stringContaining("只返回JSON"),
  userPrompt: expect.stringContaining("月季"),
  json: true,
})
```

并校验三组数组各不超过 4 项，提示词包含“不得提供医疗、治疗或食用安全结论”。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- server/plant-identification.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现严格解析与长度裁剪**

导出：

```ts
export type PlantIdentification = {
  name: string;
  commonNames: string[];
  summary: string;
  safetyNotice: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  durationMs: number;
};

export type PlantDetails = {
  carePoints: string[];
  floweringAndHabits: string[];
  meaningAndStories: string[];
};

export async function identifyPlantFast(imageUrl: string): Promise<PlantIdentification>;
export async function getPlantDetails(plantName: string): Promise<PlantDetails>;
```

使用项目现有 `parseModelJson` 解析对象；对名称、简介、安全提示和数组逐项做类型/长度限制，不把解析原文写入日志。

- [ ] **Step 4: 运行领域服务测试**

Run: `pnpm test -- server/plant-identification.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交领域服务**

```bash
git add server/plant-identification.ts server/plant-identification.test.ts
git commit -m "feat: split plant recognition and details"
```

### Task 4: REST 路由、兼容响应与计费边界

**Files:**
- Modify: `server/mp/m3-routes.ts`
- Modify: `server/mp/m3-routes.test.ts`

- [ ] **Step 1: 改写依赖测试夹具并写失败用例**

把 `M3Dependencies.identifyPlant` 替换为 `identifyPlantFast` 与 `getPlantDetails`。识别成功测试断言：

```ts
expect(body).toMatchObject({
  name: "月季",
  title: "月季",
  description: "常见观赏花卉。",
  tags: [],
  details: [],
  safetyNotice: "枝条有刺。",
  provider: "dashscope",
  model: "qwen3.7-flash-2026-07-15",
  fallbackUsed: false,
  credits: 99,
});
```

断言 `withCreditCharge(7, 1, "life_identify", ...)` 只包裹第一段。新增详情测试：

```ts
const response = await post(baseUrl, "/life/plant-details", { plantName: "月季" });
expect(response.status).toBe(200);
expect(deps.getPlantDetails).toHaveBeenCalledWith("月季");
expect(deps.withCreditCharge).not.toHaveBeenCalled();
```

覆盖空名称、81 字名称、图片字段冒充详情输入均返回 400。

- [ ] **Step 2: 运行路由测试确认失败**

Run: `pnpm test -- server/mp/m3-routes.test.ts`

Expected: FAIL，详情路由为 404 或依赖类型不匹配。

- [ ] **Step 3: 实现路由与无内容日志**

识别路由在 `finally` 中输出：

```ts
console.info("[life.plant-identify]", {
  userId: user.id,
  provider,
  model,
  fallbackUsed,
  durationMs: Date.now() - startedAt,
  success,
});
```

不得输出 `fileKey`、图片 URL、植物名称、提示词或响应正文。详情路由验证 `plantName` 后直接调用 `deps.getPlantDetails`，不经过积分函数。

- [ ] **Step 4: 运行路由与日志测试**

Run: `pnpm test -- server/mp/m3-routes.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交路由改造**

```bash
git add server/mp/m3-routes.ts server/mp/m3-routes.test.ts
git commit -m "feat: expose two-stage plant endpoints"
```

### Task 5: 图片压缩与诚实等待文案

**Files:**
- Create: `miniprogram/src/pages/life-assistant/image-compression.ts`
- Create: `server/mp/plant-image-compression.test.ts`
- Modify: `miniprogram/src/components/GenerationProgress/state.ts`
- Modify: `miniprogram/src/components/GenerationProgress/index.tsx`
- Modify: `server/mp/generation-progress.test.ts`

- [ ] **Step 1: 写失败测试覆盖 1280px 与 29/30 秒边界**

压缩纯函数测试：

```ts
expect(fitImageWithin(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
expect(fitImageWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
```

页面契约断言识花路径使用 `sizeType: ["compressed"]`、`Taro.getImageInfo`、`Taro.compressImage`、`compressedWidth` 和 `compressedHeight`。

等待文案测试：

```ts
expect(formatGenerationProgress("正在辨认", 29, "通常20秒内", {
  slowAfterSeconds: 30,
  slowLabel: "网络有点慢，再等等",
})).toBe("正在辨认…已用 29 秒，通常20秒内");

expect(formatGenerationProgress("正在辨认", 30, "通常20秒内", {
  slowAfterSeconds: 30,
  slowLabel: "网络有点慢，再等等",
})).toBe("网络有点慢，再等等…已用 30 秒");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- server/mp/plant-image-compression.test.ts server/mp/generation-progress.test.ts`

Expected: FAIL，压缩模块和慢速参数不存在。

- [ ] **Step 3: 实现压缩工具与进度参数**

压缩工具导出：

```ts
export function fitImageWithin(width: number, height: number, maxSide = 1280): {
  width: number;
  height: number;
}

export async function compressPlantImage(filePath: string): Promise<string>
```

`compressPlantImage` 使用 `getImageInfo`，超限时调用 `compressImage({ quality: 82, compressedWidth, compressedHeight })`，再读取输出尺寸验证；失败抛出“图片压缩失败，请重新选择”。

`GenerationProgress` 新增可选属性：

```ts
slowAfterSeconds?: number;
slowLabel?: string;
```

默认不改变现有页面文案；只在两个属性都存在且达到阈值时切换。

- [ ] **Step 4: 运行压缩和等待测试**

Run: `pnpm test -- server/mp/plant-image-compression.test.ts server/mp/generation-progress.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交基础前端能力**

```bash
git add miniprogram/src/pages/life-assistant/image-compression.ts server/mp/plant-image-compression.test.ts miniprogram/src/components/GenerationProgress/state.ts miniprogram/src/components/GenerationProgress/index.tsx server/mp/generation-progress.test.ts
git commit -m "feat: compress plant photos and show honest waits"
```

### Task 6: 小程序两段式结果页

**Files:**
- Modify: `miniprogram/src/services/api.ts`
- Modify: `miniprogram/src/pages/life-assistant/index.tsx`
- Modify: `miniprogram/src/pages/life-assistant/index.scss`
- Create: `server/mp/plant-ui-contract.test.ts`

- [ ] **Step 1: 写失败 UI 契约测试**

断言 API 类型含：

```ts
export type PlantIdentifyResult = {
  name: string;
  commonNames: string[];
  summary: string;
  safetyNotice: string;
  credits: number;
};

export type PlantDetails = {
  carePoints: string[];
  floweringAndHabits: string[];
  meaningAndStories: string[];
};
```

断言页面包含“了解更多”“养护要点”“花期习性”“寓意典故”“通常20秒内”“网络有点慢，再等等”，详情 API 使用 `retry: "never"`，且识别结果完成后再调用详情。

- [ ] **Step 2: 运行 UI 契约测试确认失败**

Run: `pnpm test -- server/mp/plant-ui-contract.test.ts`

Expected: FAIL，类型和文案不存在。

- [ ] **Step 3: 接入两段式状态与 API**

页面状态拆成：

```ts
const [plantResult, setPlantResult] = useState<PlantIdentifyResult>();
const [plantDetails, setPlantDetails] = useState<PlantDetails>();
const [plantDetailsBusy, setPlantDetailsBusy] = useState(false);
```

识花选择时先执行 `compressPlantImage`，再预览、读 base64 和上传。`loadPlantDetails` 只传 `plantResult.name`，使用独立 operation ID，不清空第一段结果。

识别等待组件传入：

```tsx
label="正在辨认"
estimate="通常20秒内"
slowAfterSeconds={30}
slowLabel="网络有点慢，再等等"
```

详情失败使用大字手动重试按钮，绝不自动重试。

- [ ] **Step 4: 添加适老化样式**

新增 `.life-plant-name`、`.life-plant-common-names`、`.life-plant-safety`、`.life-plant-details` 等类；主按钮沿用 `$button-main-height`、`$font-button`，安全提示使用高对比暖黄背景和不小于 `$font-body` 的正文。

- [ ] **Step 5: 运行 UI 测试和小程序类型检查**

Run: `pnpm test -- server/mp/plant-ui-contract.test.ts server/mp/generation-progress.test.ts server/mp/plant-image-compression.test.ts && pnpm check:mp`

Expected: PASS，TypeScript 无错误。

- [ ] **Step 6: 提交两段式 UI**

```bash
git add miniprogram/src/services/api.ts miniprogram/src/pages/life-assistant/index.tsx miniprogram/src/pages/life-assistant/index.scss server/mp/plant-ui-contract.test.ts
git commit -m "feat: add two-stage plant result experience"
```

### Task 7: 真实密钥三图验证脚本

**Files:**
- Create: `scripts/verify-plant-vision.ts`
- Create: `server/verify-plant-vision.test.ts`

- [ ] **Step 1: 写失败测试约束安全输出与三种样本**

测试脚本源码包含三个类别 `close-flower`、`whole-plant`、`tree-leaf`，只打印：

```ts
{
  sample,
  ok,
  provider,
  model,
  fallbackUsed,
  durationMs,
  identifiedName,
}
```

断言源码不打印 API Key、Authorization、完整请求体、图片 base64 或模型原文。测试模式允许通过依赖注入使用本地 mock URL，避免普通 `pnpm test` 联网。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- server/verify-plant-vision.test.ts`

Expected: FAIL，验证脚本不存在。

- [ ] **Step 3: 实现三图验证脚本**

脚本加载本地 `.env`，使用三张公开且稳定的代表图 URL 调用 `identifyPlantFast`，逐项计时并在最后输出：

```text
plant_vision_summary total=3 success=3 under20s=N fallback=N averageMs=...
```

任一项失败时设置 `process.exitCode = 1`，但继续完成其余样本，确保报告完整。

- [ ] **Step 4: 运行离线脚本契约测试**

Run: `pnpm test -- server/verify-plant-vision.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交验证脚本**

```bash
git add scripts/verify-plant-vision.ts server/verify-plant-vision.test.ts
git commit -m "test: add real plant vision benchmark"
```

### Task 8: 全量验证、本地配置与发布

**Files:**
- Modify, do not commit: `.env`
- Modify remotely, do not commit: `/opt/lejoy-ai/.env`
- Preserve: `miniprogram/project.config.json`
- Preserve: `miniprogram/project.private.config.json`
- Preserve: `.DS_Store`

- [ ] **Step 1: 安全写入本地非密钥配置**

使用不回显文件内容的脚本更新或追加：

```text
DASHSCOPE_VL_MODEL=qwen3.7-flash-2026-07-15
AI_VISION_FAST_PROVIDER=auto
```

只用 `awk`/`grep -q` 验证键存在，不输出 `.env` 其他内容和任何密钥值。确认 `.env` 仍被 `.gitignore` 忽略。

- [ ] **Step 2: 运行相关测试、全量测试和类型检查**

Run:

```bash
pnpm test -- server/ai/dashscopeVisionClient.test.ts server/ai/gateway-vision-fast.test.ts server/plant-identification.test.ts server/mp/m3-routes.test.ts server/mp/plant-image-compression.test.ts server/mp/generation-progress.test.ts server/mp/plant-ui-contract.test.ts server/verify-plant-vision.test.ts
pnpm test
pnpm check
pnpm check:mp
```

Expected: 所有命令退出码 0；真实联网的既有测试在无对应密钥环境按既定规则跳过。

- [ ] **Step 3: 生产构建小程序并校验 API 地址**

Run: `pnpm build:weapp:prod`

Expected: Taro 构建成功；校验脚本输出包含 `api.hxzhineng.xyz` 命中且 `127.0.0.1=0`。

- [ ] **Step 4: 检查提交范围并推送**

Run:

```bash
git status --short
git diff --check
git log --oneline origin/codex/m4-release-ready..HEAD
git push origin codex/m4-release-ready
```

Expected: 仅保留用户原有私有配置脏文件；分支推送成功。

- [ ] **Step 5: 安全更新服务器非密钥配置**

通过 SSH 在 `/opt/lejoy-ai/.env` 幂等设置：

```text
DASHSCOPE_VL_MODEL=qwen3.7-flash-2026-07-15
AI_VISION_FAST_PROVIDER=auto
```

只验证键名存在及文件权限为 `600`；不得回显 `DASHSCOPE_API_KEY` 或其他密钥。

- [ ] **Step 6: 部署并健康检查**

Run:

```bash
ssh root@47.100.254.32 'cd /opt/lejoy-ai && bash scripts/deploy/02-deploy.sh'
curl -fsS https://api.hxzhineng.xyz/api/mp/health
```

Expected: 部署脚本显示新 revision、PM2 单一 `fork_mode` 实例在线，公网健康检查返回 `{"ok":true,...}`。

- [ ] **Step 7: 执行三图真实密钥实调**

本地与生产配置一致后运行：

```bash
npx tsx scripts/verify-plant-vision.ts
```

Expected: 三项均输出 provider/model/fallback/duration；汇总成功数、20 秒内数量和平均时延。若供应商或网络导致某项超过 20 秒，如实记录，不以调整计时口径掩盖。

- [ ] **Step 8: 最终状态核验与汇报**

确认：

- 远端分支包含全部提交；
- 服务器 HEAD 与远端一致；
- 健康检查正常；
- PM2 为 fork 单实例；
- 生产构建校验通过；
- 用户私有配置仍未提交；
- 汇报最终提交号、测试结果、构建校验、部署健康结果、三图逐项耗时和“物理真机待用户上传体验版复核”的边界。
