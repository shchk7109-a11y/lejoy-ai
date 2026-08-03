# Story Topic Session Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保证同一次进入 AI 故事会期间，每次“换一批灵感”返回的四个题材都不与此前任何批次或本批其他题材重复。

**Architecture:** 小程序维护最多 40 个已展示标题并随题材请求传给现有 REST 接口。服务端校验排除列表，要求模型一次生成 8 个候选，再使用纯函数对历史标题和本批标题做归一化确定性去重，最终只返回 4 个新题材；不足 4 项时明确失败且不自动重试。

**Tech Stack:** TypeScript、React 18、Taro 4、Express、Vitest、现有 DeepSeek 文本网关。

---

### Task 1: 服务端题材标题归一化与确定性过滤

**Files:**
- Modify: `server/minimaxService.test.ts`
- Modify: `server/minimaxService.ts`

- [x] **Step 1: Write the failing normalization and filtering tests**

在 `server/minimaxService.test.ts` 导入期望的新纯函数，并添加：

```ts
expect(normalizeStoryTopicTitle(" 森林 探险！ ")).toBe("森林探险");
expect(filterFreshStoryTopics(candidates, ["森林探险"]).map((item) => item.title)).toEqual([
  "海底寻宝", "月球旅行", "会飞的书包", "勇敢的小鹿",
]);
```

候选数据同时包含“森林 探险！”历史重复和两个“海底寻宝”本批重复，证明两层去重都生效。

- [x] **Step 2: Run the focused test to verify RED**

Run: `pnpm test server/minimaxService.test.ts`

Expected: FAIL，因为 `normalizeStoryTopicTitle` 和 `filterFreshStoryTopics` 尚未导出。

- [x] **Step 3: Implement the pure functions**

在 `server/minimaxService.ts` 增加：

```ts
export function normalizeStoryTopicTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()《》【】\[\]—…-]+/g, "");
}

export function filterFreshStoryTopics(topics: StoryTopic[], excludeTitles: string[]): StoryTopic[] {
  const seen = new Set(excludeTitles.map(normalizeStoryTopicTitle).filter(Boolean));
  const fresh: StoryTopic[] = [];
  for (const topic of topics) {
    const key = normalizeStoryTopicTitle(topic.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(topic);
  }
  return fresh.slice(0, 4);
}
```

其中 `StoryTopic` 是文件内复用的 `{ title; description; protagonist }` 类型别名。

- [x] **Step 4: Verify GREEN**

Run: `pnpm test server/minimaxService.test.ts`

Expected: PASS。

- [x] **Step 5: Extend the failing model contract test**

让 `aiChatMock` 返回 8 个候选，其中含历史及本批重复；调用：

```ts
await suggestStoryTopics({
  theme: "温馨治愈",
  character: "一个6岁的小朋友",
  excludeTitles: ["森林探险"],
});
```

断言提示词包含“生成8个候选”和排除标题，结果严格为 4 个新题材；再添加过滤后仅 3 项时拒绝并抛出“AI 未返回四个全新题材”。

- [x] **Step 6: Verify the new test fails**

Run: `pnpm test server/minimaxService.test.ts`

Expected: FAIL，因为当前函数只要求 4 项且不接收排除列表。

- [x] **Step 7: Implement the model request and post-filter**

给 `suggestStoryTopics` 参数增加 `excludeTitles?: string[]`；提示词要求 8 个互不重复候选，并在存在排除项时附加：

```ts
const exclusionHint = excludeTitles.length
  ? `以下标题已经展示过，严禁重复或仅改标点：${excludeTitles.map((title) => `「${title}」`).join("、")}`
  : "";
```

解析合法对象后调用 `filterFreshStoryTopics(topics, excludeTitles)`；不足 4 项抛出 `AI 未返回四个全新题材`。

- [x] **Step 8: Verify GREEN**

Run: `pnpm test server/minimaxService.test.ts`

Expected: PASS。

### Task 2: REST 接口校验与透传排除列表

**Files:**
- Modify: `server/mp/m3-routes.test.ts`
- Modify: `server/mp/m3-routes.ts`

- [x] **Step 1: Write failing REST tests**

扩展“推荐四个题材且不扣积分”请求：

```ts
excludeTitles: ["森林探险", "月球旅行"],
```

并断言依赖收到同一数组。新增参数拒绝用例：41 项、数组中包含数字、单项超过 20 字符，均返回 400，且 `suggestStoryTopics` 未被调用。

- [x] **Step 2: Verify RED**

Run: `pnpm test server/mp/m3-routes.test.ts`

Expected: FAIL，因为路由当前忽略 `excludeTitles`。

- [x] **Step 3: Implement strict parsing**

在 `server/mp/m3-routes.ts` 增加：

```ts
function topicExclusions(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) return undefined;
  const titles = value.map(nonEmpty);
  if (titles.some((title) => !title || title.length > 20)) return undefined;
  return titles;
}
```

路由解析失败时 `badRequest(res, "历史题材列表无效")`，成功时将 `excludeTitles` 传给依赖；日志保持现状，不新增题材原文。

- [x] **Step 4: Verify GREEN**

Run: `pnpm test server/mp/m3-routes.test.ts`

Expected: PASS。

### Task 3: 小程序维护当前会话已展示标题

**Files:**
- Modify: `server/mp/trial-round-seven.test.ts`
- Modify: `miniprogram/src/services/api.ts`
- Modify: `miniprogram/src/pages/story-time/index.tsx`

- [x] **Step 1: Write failing UI/API contract tests**

在 `server/mp/trial-round-seven.test.ts` 断言：页面存在 `shownTopicTitlesRef`；题材请求传 `excludeTitles: shownTopicTitlesRef.current.slice(-40)`；成功响应通过统一辅助函数累计标题；重新开始故事不重置会话排除历史。断言 API 类型包含 `excludeTitles?: string[]`。

- [x] **Step 2: Verify RED**

Run: `pnpm test server/mp/trial-round-seven.test.ts`

Expected: FAIL，因为当前页面只保存当前批次。

- [x] **Step 3: Implement client session history**

在页面增加：

```ts
const shownTopicTitlesRef = useRef<string[]>([]);

function rememberShownTopics(nextTopics: StoryTopic[]): void {
  shownTopicTitlesRef.current = [
    ...shownTopicTitlesRef.current,
    ...nextTopics.map((topic) => topic.title),
  ].slice(-40);
}
```

请求体传当前排除列表，成功后先 `rememberShownTopics(result.topics)` 再 `setTopics`。`restart()` 不清空该 ref，因为“再讲一个故事”仍在同一次页面会话内；页面卸载自然清空。

- [x] **Step 4: Extend API data type**

将 `suggestStoryTopics` 请求类型改为：

```ts
{ theme: string; childName?: string; age?: number; customProtagonist?: string; excludeTitles?: string[] }
```

- [x] **Step 5: Verify GREEN and type safety**

Run: `pnpm test server/mp/trial-round-seven.test.ts && pnpm check:mp`

Expected: PASS。

### Task 4: 完整验证、部署与推送

**Files:**
- Modify only files listed above and this plan; preserve `miniprogram/project.config.json`, `.DS_Store`, and `miniprogram/project.private.config.json`.

- [x] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm check
pnpm check:mp
pnpm --dir miniprogram build:weapp:prod
```

Expected: 测试及类型检查退出码为 0；构建校验输出生产 API 命中且 `127.0.0.1` 为 0。

- [x] **Step 2: Inspect scoped diff**

Run:

```bash
git diff --check
git diff --name-only
```

Expected: 无 schema、密钥、`server/ai/` 或用户持有开发者工具配置变化。

- [ ] **Step 3: Commit and push**

精确暂存本任务文件，提交到 `codex/m4-release-ready` 并推送。因为服务端 REST 和提示词发生变化，随后通过 `scripts/deploy/02-deploy.sh` 更新生产服务器并用健康检查确认服务正常。
