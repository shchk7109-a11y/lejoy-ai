# Story Refresh Error Export Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除题材刷新倒计时，隔离故事结构与配图错误状态，并把相册导出修成不变形、带完整文字的竖版绘本详情页。

**Architecture:** 小程序题材刷新只使用现有并发锁；故事结构请求与配图队列分开捕获错误，结构成功后清理全局错误。导出模块提供可测试的原比例适配和布局纯函数，播放器读取图片尺寸后按计划在显式 1080×1920 Canvas 上合成。

**Tech Stack:** TypeScript、React 18、Taro 4、微信小程序 Canvas/相册 API、Vitest、SCSS。

---

### Task 1: 题材刷新取消倒计时

**Files:**
- Modify: `server/mp/trial-round-four.test.ts`
- Modify: `server/mp/trial-round-seven.test.ts`
- Modify: `miniprogram/src/features/story-time/flow.ts`
- Modify: `miniprogram/src/pages/story-time/index.tsx`
- Modify: `miniprogram/src/pages/story-time/index.scss`

- [ ] **Step 1: Write failing tests**

把旧的 30 秒断言改为：`flow.ts` 不再导出冷却常量或剩余秒数函数；页面不再包含 `topicRefreshReadyAt`、`topicRefreshRemaining` 和倒计时文案；按钮仍包含 `refreshTopics`，请求进行中才禁用。

- [ ] **Step 2: Verify RED**

Run: `pnpm test server/mp/trial-round-four.test.ts server/mp/trial-round-seven.test.ts`

Expected: FAIL，因为现有页面仍保存 30 秒状态并显示剩余秒数。

- [ ] **Step 3: Implement minimal behavior**

删除冷却状态、定时器和 `remainingTopicRefreshSeconds` 检查。`refreshTopics` 直接调用 `loadTopics()`；按钮固定显示“换一批灵感”，仅由 `busyMessage`/既有操作锁防重复请求。

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test server/mp/trial-round-four.test.ts server/mp/trial-round-seven.test.ts`

Expected: PASS。

### Task 2: 故事结构错误与配图队列隔离

**Files:**
- Create: `miniprogram/src/features/story-time/generation-flow.ts`
- Modify: `server/mp/trial-round-seven.test.ts`
- Modify: `miniprogram/src/pages/story-time/index.tsx`

- [ ] **Step 1: Write failing tests**

为新的 `runStoryStructureThenIllustrate` 编排函数写真实异步测试：结构失败时只调用结构错误处理且不启动配图；结构成功时先调用 `onStructureReady`，再运行配图；配图失败不回流为结构错误。UI 合约断言新请求开始和结构成功都会 `dismissError()`。

- [ ] **Step 2: Verify RED**

Run: `pnpm test server/mp/trial-round-seven.test.ts`

Expected: FAIL，因为编排函数尚不存在且当前一个 `try/catch` 包住结构与整段配图。

- [ ] **Step 3: Implement minimal behavior**

实现结构阶段编排函数，并在页面中将结构请求失败交给 `showMpError`；结构成功后清除全局错误、写入页面状态，再独立等待配图队列。题材刷新和故事结构新请求开始时也清除陈旧错误。

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test server/mp/trial-round-seven.test.ts`

Expected: PASS。

### Task 3: 原比例竖版绘本详情页导出

**Files:**
- Modify: `server/mp/story-export-pages.test.ts`
- Modify: `server/mp/trial-round-seven.test.ts`
- Modify: `miniprogram/src/features/story-time/export-pages.ts`
- Modify: `miniprogram/src/pages/story-player/index.tsx`
- Modify: `miniprogram/src/pages/story-player/index.scss`

- [ ] **Step 1: Write failing tests**

新增 `fitImageWithinBox` 的方图、横图、竖图断言，验证输出绘制矩形保持原始宽高比且完全落在图片框内。布局测试断言画布为 1080×1920、正文区域位于图片下方、底部页码在画布内；UI 合约断言读取图片宽高、使用适配矩形且不再 `slice(0, 7)` 截断正文。

- [ ] **Step 2: Verify RED**

Run: `pnpm test server/mp/story-export-pages.test.ts server/mp/trial-round-seven.test.ts`

Expected: FAIL，因为适配函数不存在，旧画布为 1080×1440 且图片固定拉伸至 1080×900。

- [ ] **Step 3: Implement minimal behavior**

在导出模块实现原比例 `contain` 计算和详情页布局。播放器用 `Taro.getImageInfo` 获取真实尺寸，以适配矩形绘图；显式设置 Canvas `style` 的像素尺寸与 `canvasToTempFilePath` 的 1080×1920 区域，正文全部换行绘制。

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test server/mp/story-export-pages.test.ts server/mp/trial-round-seven.test.ts && pnpm check:mp`

Expected: PASS。

### Task 4: 完整验证与交付

**Files:**
- Verify all modified files only; preserve `miniprogram/project.config.json`, `.DS_Store`, and `miniprogram/project.private.config.json`.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm check
pnpm check:mp
pnpm --dir miniprogram build:weapp:prod
```

Expected: 测试和类型检查退出码为 0；生产构建校验输出生产 API 命中且 `127.0.0.1` 为 0。

- [ ] **Step 2: Inspect diff and build artifacts**

确认没有数据库、`server/ai/`、密钥或用户持有的开发者工具配置变化。

- [ ] **Step 3: Commit and push**

只暂存本任务文件，提交到 `codex/m4-release-ready` 并推送远端。
