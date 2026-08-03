# Story Shanghainese Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AI 故事会现有朗读声音中新增上海话，同时保持其他五种音色与所有生成流程不变。

**Architecture:** 小程序声音配置增加 `dialect_shanghai` 选项，继续复用现有 `/api/mp/story/page-speech` 契约。服务端已经把该键映射为 Qwen TTS 的 `Jada`，因此不修改网关、供应商客户端、环境变量或数据库。

**Tech Stack:** TypeScript、React 18、Taro 4、Vitest、阿里云 Qwen TTS。

---

### Task 1: 上海话界面选项与契约回归

**Files:**
- Modify: `server/mp/m3-ui-contract.test.ts`
- Modify: `miniprogram/src/pages/story-time/index.tsx`

- [x] **Step 1: Write the failing UI contract test**

在现有“故事会包含六种风格、可选儿童信息、四页生成和方言朗读”用例中增加：

```ts
expect(page).toContain("上海话");
expect(page).toContain('id: "dialect_shanghai"');
```

保留四川话和粤语断言，证明不是替换原有方言。

- [x] **Step 2: Run the focused test to verify RED**

Run: `pnpm test server/mp/m3-ui-contract.test.ts`

Expected: FAIL，指出页面源码不包含“上海话”或 `dialect_shanghai`。

- [x] **Step 3: Add the minimal UI option**

在 `STORY_VOICES` 的四川话与粤语之间加入：

```ts
{ id: "dialect_shanghai", name: "上海话", emoji: "🏙️" },
```

不修改其他五个对象及其顺序。

- [x] **Step 4: Verify GREEN and mini-program types**

Run:

```bash
pnpm test server/mp/m3-ui-contract.test.ts server/ai/gateway.test.ts
pnpm check:mp
```

Expected: 两个测试文件全部通过，且小程序类型检查退出码为 0；`gateway.test.ts` 继续证明 `dialect_shanghai` 映射为 `Jada`。

### Task 2: 真实音色、全量验证、发布

**Files:**
- Add: `docs/superpowers/plans/2026-08-03-story-shanghainese-voice.md`
- Preserve: `miniprogram/project.config.json`
- Preserve: `.DS_Store`
- Preserve: `miniprogram/project.private.config.json`

- [x] **Step 1: Verify Shanghai voice with the real DashScope key**

Run:

```bash
npx tsx --env-file=.env -e 'import { dashscopeTTS } from "./server/ai/aliVoiceClient.ts"; void (async () => { const result = await dashscopeTTS("今朝讲一个温暖的小故事。", "dialect_shanghai"); console.log(JSON.stringify({ mime: result.audioMime, bytes: Buffer.from(result.audioData, "base64").length })); })();'
```

Expected: 输出非空 MIME 和大于 0 的音频字节数，不输出密钥或音频正文。

- [x] **Step 2: Run full verification**

Run:

```bash
git diff --check
pnpm test
pnpm check
pnpm check:mp
pnpm --dir miniprogram build:weapp:prod
```

Expected: 测试和类型检查退出码均为 0；生产构建校验显示 `api.hxzhineng.xyz` 命中且 `127.0.0.1` 为 0。

- [ ] **Step 3: Inspect and commit only scoped files**

Run:

```bash
git add docs/superpowers/plans/2026-08-03-story-shanghainese-voice.md server/mp/m3-ui-contract.test.ts miniprogram/src/pages/story-time/index.tsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(story): add Shanghainese narration"
```

Expected: 暂存列表只有本计划、界面配置和契约测试；开发者工具本地配置仍未暂存。

- [ ] **Step 4: Push and deploy the approved branch**

Run:

```bash
git push origin codex/m4-release-ready
ssh root@47.100.254.32 'bash /opt/lejoy-ai/scripts/deploy/02-deploy.sh'
curl -fsS https://api.hxzhineng.xyz/api/mp/health
```

Expected: 远端、服务器与本地提交一致；PM2 保持 fork 单实例 online；健康接口返回 `{ "ok": true }`。
