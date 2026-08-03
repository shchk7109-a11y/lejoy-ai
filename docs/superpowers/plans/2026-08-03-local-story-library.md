# Local Story Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 故事会增加醒目的题材刷新按钮、仅显示当前页的独立播放器、最多 6 本的本机书架、四页绘本相册导出，以及安全释放 OSS 故事临时资源。

**Architecture:** 服务端只增加当前用户故事资源的幂等释放接口，不增加数据库或 schema。小程序把故事领域逻辑、Taro 本地文件 I/O、播放器页面和书架页面分开；故事元数据存本地 Storage，图片和可用音频存微信永久本地文件，播放器同时兼容刚生成的远程草稿与已保存的本地故事。

**Tech Stack:** TypeScript、Express、Vitest、React 18、Taro 4、微信小程序 FileSystem/Canvas/相册 API、SCSS。

---

### Task 1: 本机书架领域模型与六本上限

**Files:**
- Create: `miniprogram/src/features/story-time/library.ts`
- Create: `miniprogram/src/features/story-time/library.test.ts`

- [ ] **Step 1: Write the failing tests**

覆盖：合法四页故事可加入；第 7 本返回 `full` 且不覆盖；同 ID 保存更新而不增加数量；删除返回需要清理的本地文件路径；播放器索引在 0 至 3 范围内移动。

```ts
expect(addStoryToLibrary(sixStories, seventh)).toMatchObject({ status: "full", stories: sixStories });
expect(removeStoryFromLibrary([story], story.id).files).toEqual(expect.arrayContaining(story.pages.flatMap(localFiles)));
expect(nextStoryPage(3, 4)).toBe(3);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test miniprogram/src/features/story-time/library.test.ts`
Expected: FAIL because `library.ts` does not exist.

- [ ] **Step 3: Implement the pure domain module**

定义 `LocalStoryPage`、`LocalStory`、`MAX_LOCAL_STORIES = 6`，实现 `parseStoryLibrary`、`addStoryToLibrary`、`removeStoryFromLibrary`、`previousStoryPage`、`nextStoryPage`。解析时拒绝非四页、重复页码或远程 URL 被冒充为已保存本地故事。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test miniprogram/src/features/story-time/library.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/src/features/story-time/library.ts miniprogram/src/features/story-time/library.test.ts
git commit -m "feat(mp): add local story library domain"
```

### Task 2: 当前用户故事 OSS 资源释放接口

**Files:**
- Modify: `server/mp/m3-routes.ts`
- Modify: `server/mp/m3-routes.test.ts`
- Modify: `miniprogram/src/services/api.ts`

- [ ] **Step 1: Write the failing REST tests**

新增 `/story/release-assets` 用例：

```ts
expect(await release(["stories/7/a.png", "stories-audio/7/a.mp3"])).toMatchObject({ status: 200, deleted: 2 });
expect(await release(["stories/8/a.png", "uploads/7/a.png"])).toMatchObject({ status: 400 });
expect(deps.storageDelete).not.toHaveBeenCalledWith("stories/8/a.png");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/mp/m3-routes.test.ts`
Expected: FAIL with 404 for the new route.

- [ ] **Step 3: Implement strict owned-prefix validation and deletion**

只接受最多 16 个不重复键，且每个键匹配：

```ts
new RegExp(`^(?:stories|stories-audio)/${user.id}/[A-Za-z0-9][A-Za-z0-9._-]*$`)
```

使用 `Promise.all` 调用已有 `storageDelete`，返回 `{ deleted: keys.length }`。日志只记用户 ID、文件数和耗时，不记正文、题材或文件 URL。

- [ ] **Step 4: Add the client method without retries**

```ts
releaseStoryAssets: (fileKeys: string[]) =>
  request<{ deleted: number }>("/api/mp/story/release-assets", {
    method: "POST", data: { fileKeys }, retry: "never",
  })
```

同时给 `StoryPage` 增加可选 `imageFileKey`、`audioFileKey`。

- [ ] **Step 5: Run the REST and API contract tests**

Run: `pnpm test server/mp/m3-routes.test.ts server/mp/trial-round-seven.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/mp/m3-routes.ts server/mp/m3-routes.test.ts miniprogram/src/services/api.ts server/mp/trial-round-seven.test.ts
git commit -m "feat(api): release owned story assets"
```

### Task 3: Taro 本地文件事务与待清理队列

**Files:**
- Create: `miniprogram/src/features/story-time/local-storage.ts`
- Create: `miniprogram/src/features/story-time/local-storage.test.ts`

- [ ] **Step 1: Write failing dependency-injected I/O tests**

使用内存 `storage`、`download`、`saveFile`、`unlink` 替身验证：四页图片全部落本地后才写索引；中途失败回滚已保存文件；已有音频才保存；删除故事清理所有文件；待释放键去重并在服务端确认后移除。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test miniprogram/src/features/story-time/local-storage.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the storage adapter**

提供：

```ts
createStoryStorage(deps)
  .list()
  .saveDraft(draft)
  .remove(storyId)
  .queueRemoteAssets(fileKeys)
  .flushRemoteAssets(release)
```

索引键为 `lejoy.story.library.v1`，待清理键为 `lejoy.story.remote-assets.v1`。生产依赖使用 `Taro.downloadFile`、`Taro.saveFile`、`Taro.getFileSystemManager().unlink` 和同步 Storage；保存失败必须回滚当前事务生成的永久文件。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test miniprogram/src/features/story-time/local-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/src/features/story-time/local-storage.ts miniprogram/src/features/story-time/local-storage.test.ts
git commit -m "feat(mp): persist stories on the current device"
```

### Task 4: 独立沉浸式故事播放器

**Files:**
- Create: `miniprogram/src/pages/story-player/index.tsx`
- Create: `miniprogram/src/pages/story-player/index.scss`
- Create: `miniprogram/src/pages/story-player/index.config.ts`
- Modify: `miniprogram/src/app.config.ts`
- Modify: `miniprogram/src/pages/story-time/index.tsx`
- Modify: `server/mp/trial-round-seven.test.ts`

- [ ] **Step 1: Write the failing UI contract test**

断言新路由注册、播放器只按 `pages[currentPageIndex]` 渲染一张图片、显示页码和当前文字、包含上一页/暂停继续/下一页、`audio.onEnded` 前进一页、卸载销毁音频并关闭常亮。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/mp/trial-round-seven.test.ts`
Expected: FAIL because player files and route are missing.

- [ ] **Step 3: Preserve file keys while generating assets**

在图片和语音成功回填中同时保存返回的 `fileKey`：

```ts
savePagePatch(pageNumber, { imageUrl: image.imageUrl, imageFileKey: image.fileKey });
savePagePatch(pageNumber, { audioUrl: speech.audioUrl, audioFileKey: speech.fileKey });
```

- [ ] **Step 4: Navigate to the player after speech is ready**

把当前草稿写入 `lejoy.story.playing.v1`，然后 `Taro.navigateTo({ url: "/pages/story-player/index" })`。已有四页音频时直接进入；首次朗读仍按原有逐页生成和积分规则执行。

- [ ] **Step 5: Implement the player**

播放器仅渲染当前页 `<Image>` 和当前文字。自动朗读、手动翻页、暂停继续均复用单个 `InnerAudioContext`；播放期间开启屏幕常亮，结束或离开时恢复。保存成功后把页面 URL 切为本地路径，再调用资源释放队列。

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test server/mp/trial-round-seven.test.ts && pnpm check:mp`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/src/app.config.ts miniprogram/src/pages/story-time miniprogram/src/pages/story-player server/mp/trial-round-seven.test.ts
git commit -m "feat(mp): add immersive story playback"
```

### Task 5: 六本故事书架与删除

**Files:**
- Create: `miniprogram/src/pages/story-library/index.tsx`
- Create: `miniprogram/src/pages/story-library/index.scss`
- Create: `miniprogram/src/pages/story-library/index.config.ts`
- Modify: `miniprogram/src/app.config.ts`
- Modify: `miniprogram/src/pages/story-time/index.tsx`
- Modify: `miniprogram/src/pages/story-player/index.tsx`
- Modify: `server/mp/trial-round-seven.test.ts`

- [ ] **Step 1: Extend the failing UI contract test**

断言书架路由、`最多保存 6 本`、空状态、播放/删除按钮、删除二次确认，以及书架满时播放器显示“请先删除一本”并可跳转书架。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/mp/trial-round-seven.test.ts`
Expected: FAIL on missing shelf behavior.

- [ ] **Step 3: Implement shelf and entry points**

书架 `useDidShow` 每次重新读取本地索引。播放把选中故事写入 playing key 后进入播放器；删除先 `Taro.showModal`，确认后调用本地存储事务。故事会首页和播放器均提供“我的故事”入口。

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test miniprogram/src/features/story-time/library.test.ts miniprogram/src/features/story-time/local-storage.test.ts server/mp/trial-round-seven.test.ts && pnpm check:mp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/src/app.config.ts miniprogram/src/pages/story-time miniprogram/src/pages/story-player miniprogram/src/pages/story-library server/mp/trial-round-seven.test.ts
git commit -m "feat(mp): add six-story local shelf"
```

### Task 6: 四页绘本图片导出到相册

**Files:**
- Create: `miniprogram/src/features/story-time/export-pages.ts`
- Create: `miniprogram/src/features/story-time/export-pages.test.ts`
- Modify: `miniprogram/src/pages/story-player/index.tsx`
- Modify: `miniprogram/src/pages/story-player/index.scss`
- Modify: `server/mp/trial-round-seven.test.ts`

- [ ] **Step 1: Write failing exporter tests**

验证中文按画布宽度分行且不丢字；导出严格按 1、2、3、4 页串行；失败返回准确页码；每页绘制页码和“AI 生成内容”。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test miniprogram/src/features/story-time/export-pages.test.ts`
Expected: FAIL because exporter does not exist.

- [ ] **Step 3: Implement canvas render plan and serial exporter**

纯函数 `wrapCanvasText` 和 `buildStoryPageRenderPlan` 负责布局；注入式 `exportStoryPages` 串行执行绘制及保存。播放器放置隐藏 Canvas，用 Taro Canvas API 合成插图、正文、页码、标题和 AI 标识，再调用 `saveImageToPhotosAlbum`。

- [ ] **Step 4: Handle album permission explicitly**

首次调用触发授权；拒绝时显示大字说明并提供 `Taro.openSetting()`；成功提示“4 张绘本图片已保存到相册”；单页失败提示具体页码，不自动重存已成功页面。

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test miniprogram/src/features/story-time/export-pages.test.ts server/mp/trial-round-seven.test.ts && pnpm check:mp`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/src/features/story-time/export-pages.ts miniprogram/src/features/story-time/export-pages.test.ts miniprogram/src/pages/story-player server/mp/trial-round-seven.test.ts
git commit -m "feat(mp): export storybook pages to album"
```

### Task 7: 题材刷新可见性与完整验收

**Files:**
- Modify: `miniprogram/src/pages/story-time/index.tsx`
- Modify: `miniprogram/src/pages/story-time/index.scss`
- Modify: `server/mp/trial-round-seven.test.ts`

- [ ] **Step 1: Write the failing cooldown interaction test**

断言冷却期不使用原生 `disabled` 隐藏交互，按钮始终含“换一批灵感”，显示剩余秒数，冷却期点击仍进入 `refreshTopics` 并弹出提示，归零后使用暖橙激活样式。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/mp/trial-round-seven.test.ts`
Expected: FAIL because current button is disabled during cooldown.

- [ ] **Step 3: Implement the visible cooldown button**

只在请求进行时禁用；冷却期间添加 `topic-refresh--cooldown`，保留点击处理和剩余秒数，归零后切换 `topic-refresh--ready`。样式满足全宽、高至少 108rpx、字号至少 40rpx和暖橙主色令牌。

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
pnpm test
pnpm check
pnpm check:mp
pnpm build:weapp:prod
```

Expected: all tests and typechecks pass; production build verifier reports production API present and `127.0.0.1` count zero.

- [ ] **Step 5: Commit, push, deploy, and health-check**

```bash
git add miniprogram/src/pages/story-time server/mp/trial-round-seven.test.ts
git commit -m "fix(mp): make story inspiration refresh obvious"
git push origin codex/m4-release-ready
ssh root@47.100.254.32 'bash /opt/lejoy-ai/scripts/deploy/02-deploy.sh'
curl -fsS https://api.hxzhineng.xyz/api/mp/health
```

Expected: remote branch updated, PM2 fork single instance healthy, public health endpoint returns success.

## Self-review

- Spec coverage: refresh button, single-page player, local-only six-book shelf, delete, four album images, OSS release, no schema change, tests/build/deploy are each mapped to a task.
- Placeholder scan: no TBD/TODO or unspecified error-handling step remains.
- Type consistency: `LocalStoryPage` carries both URL and file key; storage converts remote URLs to local paths before resource release; server/client endpoint name is consistently `/story/release-assets`.
