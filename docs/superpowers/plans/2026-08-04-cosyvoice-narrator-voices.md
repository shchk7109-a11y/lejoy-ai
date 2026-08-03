# CosyVoice Narrator Voices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将故事会“温柔女声”和“沉稳讲述”分别切换到百炼 CosyVoice 的龙妙、龙楠，同时保持上海话 Jada 与其他音色不变。

**Architecture:** 在阿里语音客户端增加纯函数音色配置解析层，由它选择 Qwen TTS 或 CosyVoice 接口、模型与音色；`gateway.ts` 继续作为唯一业务入口，并使用解析结果记录实际模型。前端 API、页面、积分和数据库均不改变。

**Tech Stack:** TypeScript、Axios、Vitest、阿里云百炼 DashScope、Taro 微信小程序、PM2 部署脚本。

---

### Task 1: 用失败测试锁定双模型音色路由

**Files:**
- Modify: `server/ai/gateway.test.ts`
- Create: `server/ai/gateway-tts.test.ts`

- [ ] **Step 1: 为阿里语音配置解析增加失败测试**

在 `server/ai/gateway.test.ts` 导入 `resolveAliTtsProfile`，增加：

```ts
describe("阿里TTS模型分流", () => {
  it("温柔女声和沉稳讲述使用 CosyVoice 龙妙与龙楠", () => {
    expect(resolveAliTtsProfile("gentle")).toMatchObject({
      family: "cosyvoice",
      model: "cosyvoice-v3-flash",
      voice: "longmiao_v3",
    });
    expect(resolveAliTtsProfile("steady")).toMatchObject({
      family: "cosyvoice",
      model: "cosyvoice-v3-flash",
      voice: "longnan_v3",
    });
  });

  it("上海话继续使用 Qwen TTS 的 Jada", () => {
    expect(resolveAliTtsProfile("dialect_shanghai")).toMatchObject({
      family: "qwen",
      model: "qwen3-tts-flash",
      voice: "Jada",
    });
  });
});
```

- [ ] **Step 2: 为网关实际模型遥测增加失败测试**

创建 `server/ai/gateway-tts.test.ts`，mock `ENV`、供应商客户端与 `recordAiRequestMetadata`，调用：

```ts
await aiTTS("第一页故事", "gentle");
expect(recordAiRequestMetadata).toHaveBeenCalledWith("ali", "cosyvoice-v3-flash");

await aiTTS("上海闲话", "dialect_shanghai");
expect(recordAiRequestMetadata).toHaveBeenCalledWith("ali", "qwen3-tts-flash");
```

同时断言 `dashscopeTTS` 收到原始 `voiceType`，确保网关不改写业务音色键。

- [ ] **Step 3: 运行测试并确认按预期失败**

Run: `pnpm vitest run server/ai/gateway.test.ts server/ai/gateway-tts.test.ts`

Expected: FAIL，原因是 `resolveAliTtsProfile`、`dashscopeCosyvoiceModel` 或实际模型遥测尚未实现，而不是测试语法或 mock 装载错误。

### Task 2: 实现 CosyVoice 与 Qwen TTS 分流

**Files:**
- Modify: `server/_core/env.ts`
- Modify: `server/ai/aliVoiceClient.ts`
- Modify: `server/ai/gateway.ts`
- Test: `server/ai/gateway.test.ts`
- Test: `server/ai/gateway-tts.test.ts`

- [ ] **Step 1: 增加 CosyVoice 模型配置**

在 `server/_core/env.ts` 的 DashScope 配置区加入：

```ts
dashscopeCosyvoiceModel: process.env.DASHSCOPE_COSYVOICE_MODEL ?? "cosyvoice-v3-flash",
```

- [ ] **Step 2: 增加可单测的阿里语音配置解析函数**

在 `server/ai/aliVoiceClient.ts` 增加：

```ts
const COSYVOICE_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer";
const COSYVOICE_TTS_VOICE_MAP: Record<string, string> = {
  gentle: "longmiao_v3",
  steady: "longnan_v3",
};

export type AliTtsProfile = {
  family: "qwen" | "cosyvoice";
  model: string;
  voice: string;
  path: string;
};

export function resolveAliTtsProfile(voiceType = "lively"): AliTtsProfile {
  const cosyVoice = COSYVOICE_TTS_VOICE_MAP[voiceType];
  if (cosyVoice) {
    return {
      family: "cosyvoice",
      model: ENV.dashscopeCosyvoiceModel,
      voice: cosyVoice,
      path: COSYVOICE_PATH,
    };
  }
  return {
    family: "qwen",
    model: ENV.dashscopeTtsModel,
    voice: mapVoice(voiceType),
    path: GENERATION_PATH,
  };
}
```

- [ ] **Step 3: 按 profile 构造请求并兼容两类 URL 响应**

在 `dashscopeTTS` 内使用 `resolveAliTtsProfile(voiceType)`：

```ts
const profile = resolveAliTtsProfile(voiceType);
const input = profile.family === "cosyvoice"
  ? { text, voice: profile.voice, format: "wav", sample_rate: 24000 }
  : { text, voice: profile.voice, language_type: "Chinese" };
const body = { model: profile.model, input };
```

POST 地址改为 `${ENV.dashscopeBaseUrl}${profile.path}`；音频地址兼容 `output.audio.url` 与 `output.url`。重试日志标签按模型族区分，且不记录文本或签名 URL。

- [ ] **Step 4: 网关记录实际模型**

在 `server/ai/gateway.ts` 导入 `resolveAliTtsProfile`：

```ts
const profile = resolveAliTtsProfile(voiceType);
recordAiRequestMetadata("ali", profile.model);
return dashscopeTTS(text, voiceType);
```

- [ ] **Step 5: 运行目标测试并确认转绿**

Run: `pnpm vitest run server/ai/gateway.test.ts server/ai/gateway-tts.test.ts`

Expected: PASS，龙妙、龙楠走 CosyVoice，Jada 走 Qwen，遥测模型匹配实际调用。

- [ ] **Step 6: 运行类型检查和完整测试**

Run: `pnpm check && pnpm test`

Expected: 两条命令退出码均为 0；无密钥真实联网测试按既有规则跳过。

### Task 3: 真实语音验证与生产小程序构建

**Files:**
- Modify: `miniprogram/dist/**`（仅构建产物发生变化时）

- [ ] **Step 1: 用真实密钥验证三条音色链路**

通过一次性诊断命令分别验证 `gentle -> longmiao_v3`、`steady -> longnan_v3`、`dialect_shanghai -> Jada`。控制台只输出音色键、模型、HTTP 状态、耗时、MIME 和音频字节数；不输出密钥、故事原文或签名 URL。三项音频字节数必须大于 0。

- [ ] **Step 2: 构建生产小程序**

Run: `pnpm build:weapp`

Expected: Taro 构建成功，生产校验命中 `api.hxzhineng.xyz`，`127.0.0.1` 出现次数为 0。

- [ ] **Step 3: 复跑完整验证**

Run: `pnpm check && pnpm test`

Expected: 全绿。

### Task 4: 精确提交、推送和生产部署

**Files:**
- Commit: `server/_core/env.ts`
- Commit: `server/ai/aliVoiceClient.ts`
- Commit: `server/ai/gateway.ts`
- Commit: `server/ai/gateway.test.ts`
- Commit: `server/ai/gateway-tts.test.ts`
- Commit: `miniprogram/dist/**`（若构建产生受跟踪变化）

- [ ] **Step 1: 检查并精确暂存**

Run:

```bash
git status --short
git diff --check
git add server/_core/env.ts server/ai/aliVoiceClient.ts server/ai/gateway.ts server/ai/gateway.test.ts server/ai/gateway-tts.test.ts
```

若 `miniprogram/dist/**` 有受跟踪变化，再精确加入。不得加入 `.DS_Store`、`miniprogram/project.config.json` 或 `miniprogram/project.private.config.json`。

- [ ] **Step 2: 提交并推送**

Run: `git commit -m "feat(story): upgrade Mandarin narrator voices" && git push origin codex/m4-release-ready`

Expected: 推送成功，用户自有未提交文件仍保留。

- [ ] **Step 3: 部署生产服务器**

Run:

```bash
ssh root@47.100.254.32 'bash /opt/lejoy-ai/scripts/deploy/02-deploy.sh'
curl -fsS https://api.hxzhineng.xyz/api/mp/health
```

Expected: 部署脚本完成拉取、重建和 PM2 单实例 reload；健康接口返回正常状态。

- [ ] **Step 4: 核验生产日志不含用户文本**

通过 SSH 检查本次请求附近的 PM2 元数据日志，只确认 `provider=ali` 与实际 `model`，不得回显用户内容或任何密钥。
