# Dish Health Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mini-program life assistant recipe/health entries with one accessible dish health analysis flow that accepts text, Douyin shares, voice, camera, or album images and charges only after dish recognition succeeds.

**Architecture:** Add a focused `server/dish-analysis.ts` domain module for strict JSON parsing, DeepSeek/Kimi prompts, and bounded Douyin public-metadata fetching. Keep orchestration, owned-image checks, media storage, and credit charging in the existing M3 REST router; the mini-program consumes one discriminated-union endpoint and renders dedicated dish input, not-found, and result states.

**Tech Stack:** TypeScript, Express, Vitest, Taro React, NutUI, existing AI gateway, object storage/media checks, SCSS design tokens.

---

## File map

- Create `server/dish-analysis.ts`: dish extraction, image inspection, nutrition schema validation, disclaimer, Douyin URL and metadata helpers.
- Create `server/dish-analysis.test.ts`: unit tests for model JSON contracts and safe public-page fetching.
- Modify `server/mp/m3-routes.ts`: `/life/dish-analyze` orchestration, recognition-before-charge, parallel nutrition/image calls, response assembly.
- Modify `server/mp/m3-routes.test.ts`: route fallback, no-charge, image ownership, parallel-start and image-failure coverage.
- Modify `miniprogram/src/services/api.ts`: request and discriminated response types plus API method.
- Modify `miniprogram/src/pages/life-assistant/index.tsx`: two-entry flow and dish result UI.
- Modify `miniprogram/src/pages/life-assistant/index.scss`: accessible input, score, nutrient grid, ingredient groups and advice card styling.
- Modify `server/mp/m3-ui-contract.test.ts`: new entry and result contract.
- Modify `server/mp/modules.ts` and `server/mp/modules.test.ts`: new module description.

### Task 1: Dish analysis domain module

**Files:**
- Create: `server/dish-analysis.test.ts`
- Create: `server/dish-analysis.ts`

- [ ] **Step 1: Write failing model-contract tests**

Add tests that inject an `aiChat` stub and assert these wished-for APIs:

```ts
await expect(extractDishName("今天做糖醋排骨", chat)).resolves.toBe("糖醋排骨");
await expect(inspectDishImage("https://cdn.example/dish.jpg", chat)).resolves.toEqual({
  dishName: "番茄炒蛋",
  ingredients: { primary: ["番茄", "鸡蛋"], secondary: [], seasonings: ["盐", "食用油"] },
});
await expect(analyzeDishNutrition({ dishName: "番茄炒蛋" }, chat)).resolves.toMatchObject({
  healthScore: 82,
  scoreLabel: "较健康",
  disclaimer: DISH_ANALYSIS_DISCLAIMER,
});
```

Also reject a bare JSON array, out-of-range score, missing nutrition keys, and medical treatment language.

- [ ] **Step 2: Run the domain tests and verify RED**

Run: `pnpm vitest run server/dish-analysis.test.ts`

Expected: FAIL because `server/dish-analysis.ts` and its exports do not exist.

- [ ] **Step 3: Implement strict object parsing and AI tasks**

Implement these public contracts:

```ts
export const DISH_ANALYSIS_DISCLAIMER = "营养数据为常见做法的估算值，仅供饮食参考，不构成医疗建议；实际数值会因食材、份量和烹饪方式不同而变化。";

export type DishIngredients = {
  primary: string[];
  secondary: string[];
  seasonings: string[];
};

export type DishNutritionAnalysis = {
  title: string;
  healthScore: number;
  scoreLabel: string;
  portionBasis: string;
  nutrition: Record<"calories" | "protein" | "fat" | "carbs" | "sodium" | "sugar", string>;
  ingredients: DishIngredients;
  overview: string;
  attentionPoints: Array<{ kind: "positive" | "caution"; title: string; detail: string }>;
  cookingTips: string[];
  pairingTips: string[];
  tags: string[];
  disclaimer: string;
};

export async function extractDishName(text: string, chat = aiChat): Promise<string | undefined>;
export async function inspectDishImage(imageUrl: string, chat = aiChat): Promise<{ dishName?: string; ingredients: DishIngredients }>;
export async function analyzeDishNutrition(
  input: { dishName: string; ingredients?: DishIngredients },
  chat = aiChat,
): Promise<DishNutritionAnalysis>;
```

Every JSON prompt must request an object. Limit names and list items, derive `scoreLabel` deterministically from the score, override any model disclaimer with the fixed constant, and reject treatment/drug/diagnosis wording.

- [ ] **Step 4: Run model-contract tests and verify GREEN**

Run: `pnpm vitest run server/dish-analysis.test.ts`

Expected: all model-contract tests PASS.

- [ ] **Step 5: Write failing Douyin metadata tests**

Test a manual redirect chain using an injected fetch stub:

```ts
const fetchImpl = vi.fn()
  .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://www.douyin.com/video/123" } }))
  .mockResolvedValueOnce(new Response(
    '<html><head><title>糖醋排骨的家常做法</title><meta name="description" content="少油版糖醋排骨"></head></html>',
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  ));

await expect(fetchDouyinPublicMetadata("复制 https://v.douyin.com/abc/ 看看", fetchImpl))
  .resolves.toContain("糖醋排骨");
```

Cover missing short URL, redirect to a non-Douyin host, non-HTML response, oversized response, redirect limit, and fetch rejection returning `undefined` without logging input content.

- [ ] **Step 6: Run safe-fetch tests and verify RED**

Run: `pnpm vitest run server/dish-analysis.test.ts`

Expected: FAIL because `fetchDouyinPublicMetadata` is not implemented.

- [ ] **Step 7: Implement bounded public metadata fetching**

Implement:

```ts
export function extractDouyinShortUrl(text: string): string | undefined;
export async function fetchDouyinPublicMetadata(
  text: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<string | undefined>;
```

Use `redirect: "manual"`, at most three redirects, HTTPS-only `v.douyin.com`/`douyin.com` subdomains, a normal browser User-Agent, no cookies, HTML-only responses, and a 256 KiB body cap. Return only bounded title/description text and silently return `undefined` on expected fetch failures.

- [ ] **Step 8: Run domain tests and commit**

Run: `pnpm vitest run server/dish-analysis.test.ts`

Expected: PASS with zero failed tests.

Commit:

```bash
git add server/dish-analysis.ts server/dish-analysis.test.ts
git commit -m "feat: add safe dish analysis domain"
```

### Task 2: REST orchestration, charge boundary, and concurrency

**Files:**
- Modify: `server/mp/m3-routes.test.ts`
- Modify: `server/mp/m3-routes.ts`

- [ ] **Step 1: Extend the route dependency test factory and write failing route tests**

Add injectable dependencies:

```ts
extractDishName: typeof extractDishName;
fetchDouyinPublicMetadata: typeof fetchDouyinPublicMetadata;
inspectDishImage: typeof inspectDishImage;
analyzeDishNutrition: typeof analyzeDishNutrition;
```

Write tests for:

- direct text recognition skips metadata fetching and charges once;
- metadata fallback calls extraction twice;
- complete text miss returns `{ code: "DISH_NOT_FOUND" }` with current credits and never calls `withCreditCharge`;
- owned photo recognition returns the original image URL and charges once;
- photo miss does not charge;
- non-owned photo returns `BAD_REQUEST`;
- rejected content does not call recognition or charge.

- [ ] **Step 2: Write the parallel-start regression test**

Use unresolved promises to prove both tasks start before either finishes:

```ts
let resolveNutrition!: (value: DishNutritionAnalysis) => void;
let resolveImage!: (value: string) => void;
const nutritionPromise = new Promise<DishNutritionAnalysis>((resolve) => { resolveNutrition = resolve; });
const imagePromise = new Promise<string>((resolve) => { resolveImage = resolve; });

const pendingResponse = post(baseUrl, "/life/dish-analyze", { dishText: "番茄炒蛋" });
await vi.waitFor(() => {
  expect(deps.analyzeDishNutrition).toHaveBeenCalledOnce();
  expect(deps.generateFoodImage).toHaveBeenCalledOnce();
});
resolveNutrition(nutrition);
resolveImage(imageDataUrl);
await pendingResponse;
```

Add a separate test where image generation rejects but nutrition succeeds and the endpoint returns `imageSource: "none"` rather than failing.

- [ ] **Step 3: Run route tests and verify RED**

Run: `pnpm vitest run server/mp/m3-routes.test.ts`

Expected: FAIL because the new endpoint and dependency fields do not exist.

- [ ] **Step 4: Implement `/life/dish-analyze`**

Validate exactly one of `dishText` and `fileKey`. Run text security before text recognition. For text, call direct extraction, then optional public metadata, then extraction again. For images, resolve the owned upload and run Kimi inspection.

Return this before charging when recognition misses:

```ts
res.json({
  code: "DISH_NOT_FOUND",
  message: "没认出这道菜，请说一下菜名，或拍张照片",
  credits: await deps.getCredits(user.id),
});
```

After recognition, wrap analysis in:

```ts
const charged = await deps.withCreditCharge(user.id, 1, "life_dish_analyze", async () => {
  const nutritionPromise = deps.analyzeDishNutrition({ dishName, ingredients });
  const imagePromise = source
    ? Promise.resolve(undefined)
    : deps.generateFoodImage(dishName);
  const [nutritionResult, imageResult] = await Promise.allSettled([nutritionPromise, imagePromise]);
  if (nutritionResult.status === "rejected") throw nutritionResult.reason;
  // Store and submit a fulfilled generated image; otherwise return imageSource "none".
}, "生活助手：菜品健康分析");
```

This ordering is mandatory: both promises are created before the first await, so generated food art cannot serialize behind nutrition analysis.

- [ ] **Step 5: Run route and charge tests and verify GREEN**

Run: `pnpm vitest run server/mp/m3-routes.test.ts server/credits.charge.test.ts`

Expected: PASS with direct, fallback, miss, photo, concurrency and compensation cases green.

- [ ] **Step 6: Commit server endpoint**

```bash
git add server/mp/m3-routes.ts server/mp/m3-routes.test.ts
git commit -m "feat: add charged dish health endpoint"
```

### Task 3: Mini-program API contract and entry contract

**Files:**
- Modify: `miniprogram/src/services/api.ts`
- Modify: `server/mp/m3-ui-contract.test.ts`
- Modify: `server/mp/modules.ts`
- Modify: `server/mp/modules.test.ts`

- [ ] **Step 1: Write failing UI and module contract tests**

Require the life page to contain exactly the new product labels and core result sections:

```ts
for (const label of ["菜品健康分析", "识花草", "输入菜名，或粘贴抖音分享内容", "拍一道菜", "从相册选择"]) {
  expect(page).toContain(label);
}
for (const removed of ["查菜谱", "健康百科"]) expect(page).not.toContain(removed);
for (const section of ["营养估算口径", "重点关注", "原材料", "配料", "调味料", "更健康的吃法"]) {
  expect(page).toContain(section);
}
expect(page).toContain("DISH_NOT_FOUND");
expect(page).toContain("focus={dishInputFocused}");
expect(page).toContain("aspectFit");
```

Update the module test to expect description `菜品健康分析、识花草`.

- [ ] **Step 2: Run UI contract tests and verify RED**

Run: `pnpm vitest run server/mp/m3-ui-contract.test.ts server/mp/modules.test.ts`

Expected: FAIL because the old entries and module description remain.

- [ ] **Step 3: Add discriminated API types and request method**

Define `DishAnalyzeSuccess`, `DishAnalyzeNotFound`, and `DishAnalyzeResult`, matching the approved design. Add:

```ts
analyzeDish: (data: { dishText: string } | { fileKey: string }, operationId?: string) =>
  request<DishAnalyzeResult>("/api/mp/life/dish-analyze", {
    method: "POST",
    data,
    retry: "never",
    operationId,
  }),
```

Keep legacy API methods for old experience-package compatibility.

- [ ] **Step 4: Update the module description**

Change only the life assistant description to `菜品健康分析、识花草`; keep backend theme delivery unchanged.

- [ ] **Step 5: Run type and contract checks**

Run: `pnpm check:mp && pnpm vitest run server/mp/m3-ui-contract.test.ts server/mp/modules.test.ts`

Expected at this intermediate point: type check PASS; UI contract may still fail until Task 4, while the module contract passes.

### Task 4: Accessible life assistant UI and result card

**Files:**
- Modify: `miniprogram/src/pages/life-assistant/index.tsx`
- Modify: `miniprogram/src/pages/life-assistant/index.scss`
- Modify: `server/mp/m3-ui-contract.test.ts`

- [ ] **Step 1: Implement state transitions against the failing contract**

Use `Mode = "dish" | "plant"`, separate `DishAnalyzeSuccess` and plant result state, and keep one `dishText` value for keyboard, paste, and `VoiceInput` results.

When `DISH_NOT_FOUND` arrives:

```ts
setDishNotice(data.message);
setDishInputFocused(false);
setTimeout(() => setDishInputFocused(true), 0);
```

Do not call `showMpError`. Preserve input and return to the unified dish input panel.

- [ ] **Step 2: Render the approved result hierarchy**

Render image/title/score, `portionBasis`, the fixed six nutrient cells, attention cards, three ingredient groups, overview, cooking tips, pairing tips, disclaimer and `AigcBadge`. Use stable keys that include the section name to avoid duplicate-text key collisions.

- [ ] **Step 3: Add token-compliant styling**

Use existing SCSS tokens. Enforce:

```scss
.life-primary-button { min-height: $button-main-height; font-size: $font-button; background: $color-primary; }
.life-nutrition-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20rpx; }
.life-result__image { width: 100%; height: 500rpx; object-fit: contain; }
.life-score__value { font-size: 88rpx; line-height: 1; }
```

Use green/amber/neutral accessible surfaces for meaning, while retaining the warm-orange primary action. No component-library default red buttons.

- [ ] **Step 4: Run contract and type tests and verify GREEN**

Run: `pnpm check:mp && pnpm vitest run server/mp/m3-ui-contract.test.ts server/mp/m4-release-polish.test.ts server/mp/m4-privacy-ui.test.ts server/mp/generation-progress.test.ts`

Expected: all checks PASS.

- [ ] **Step 5: Commit mini-program UI**

```bash
git add miniprogram/src/services/api.ts miniprogram/src/pages/life-assistant/index.tsx miniprogram/src/pages/life-assistant/index.scss server/mp/m3-ui-contract.test.ts server/mp/modules.ts server/mp/modules.test.ts
git commit -m "feat: redesign life assistant dish analysis"
```

### Task 5: Full verification, publish, and production evidence

**Files:**
- No source changes expected; only existing generated `miniprogram/dist` output may change if tracked.

- [ ] **Step 1: Inspect scope and protected files**

Run:

```bash
git status --short
git diff --check
git diff -- miniprogram/project.config.json miniprogram/project.private.config.json
```

Expected: user-owned `project.config.json`, `.DS_Store`, and `project.private.config.json` remain uncommitted and untouched by this work.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
pnpm test
pnpm check
pnpm check:mp
pnpm build:weapp:prod
```

Expected: zero test failures, both TypeScript checks exit 0, and the production build verifier reports `api.hxzhineng.xyz` present with zero `127.0.0.1` occurrences.

- [ ] **Step 3: Push all commits including design commit `1c59c50`**

Run: `git push origin codex/m4-release-ready`

Expected: remote branch advances through the final implementation commit and includes `1c59c50`.

- [ ] **Step 4: Deploy production**

Run: `ssh root@47.100.254.32 'cd /opt/lejoy-ai && bash scripts/deploy/02-deploy.sh'`

Expected: deployment pulls `codex/m4-release-ready`, rebuilds, and reloads PM2 as one fork instance.

- [ ] **Step 5: Verify production health and privacy logs**

Run:

```bash
curl -fsS https://api.hxzhineng.xyz/api/mp/health
ssh root@47.100.254.32 'pm2 status && pm2 logs lejoy-ai --lines 80 --nostream'
```

Expected: public health returns success, PM2 shows one online fork instance, and recent request logs contain only path, duration, error code, provider, and model metadata—not dish text, Douyin title, URLs, or image contents.

- [ ] **Step 6: Report evidence**

Report the final commit, push result, test totals, production-build verifier output, deployment result, health response, and the requirement that the user upload experience version `0.9.7`.

