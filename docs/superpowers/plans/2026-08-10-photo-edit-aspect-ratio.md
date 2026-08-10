# Photo Edit Aspect Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Seedream photo editing at the 1536-pixel speed tier while preserving every source image's orientation and aspect ratio.

**Architecture:** Add one pure sizing module that converts source dimensions plus a maximum edge into an aligned `WIDTHxHEIGHT` Seedream size. `aiEditImage` reads the source dimensions before the first model call when adaptive sizing is enabled, while retaining the existing unsupported-size fallback and legacy size configuration behavior.

**Tech Stack:** TypeScript, Vitest, Node `fetch`, Seedream Ark image API, PM2, Taro production build.

---

## File map

- Create `server/ai/imageEditSize.ts`: parse adaptive sizing configuration and calculate aspect-preserving Seedream dimensions.
- Create `server/ai/imageEditSize.test.ts`: pure unit coverage for portrait, landscape, widescreen, square, invalid, and extreme ratios.
- Modify `server/_core/env.ts`: expose `ARK_IMAGE_EDIT_MAX_EDGE` without changing existing `ARK_IMAGE_EDIT_SIZE` compatibility.
- Modify `server/ai/gateway.ts`: read source dimensions before the first Seedream edit request and pass the calculated size.
- Modify `server/ai/gateway-edit.test.ts`: verify gateway call order, no-model-call failures, fallback, and no duplicate generation.
- Modify `.env.example`: document maximum-edge production sizing.

### Task 1: Pure aspect-preserving size calculator

**Files:**
- Create: `server/ai/imageEditSize.ts`
- Create: `server/ai/imageEditSize.test.ts`

- [ ] **Step 1: Write failing sizing tests**

Create `server/ai/imageEditSize.test.ts` with assertions equivalent to:

```ts
import { describe, expect, it } from "vitest";
import { fitImageEditSize, resolveImageEditMaxEdge } from "./imageEditSize";

describe("fitImageEditSize", () => {
  it.each([
    [1200, 1600, "1152x1536"],
    [1600, 1200, "1536x1152"],
    [1920, 1080, "1536x864"],
    [1000, 1000, "1536x1536"],
  ])("keeps %sx%s source ratio", (width, height, expected) => {
    expect(fitImageEditSize(width, height, 1536)).toBe(expected);
  });

  it("rounds the short edge to the nearest 16 pixels", () => {
    expect(fitImageEditSize(1280, 1707, 1536)).toBe("1152x1536");
  });

  it("rejects dimensions whose fitted short edge is below 512", () => {
    expect(() => fitImageEditSize(4000, 500, 1536)).toThrow(/比例过于狭长/);
  });
});

describe("resolveImageEditMaxEdge", () => {
  it("prefers the explicit maximum edge", () => {
    expect(resolveImageEditMaxEdge("1536", "1152x1536")).toBe(1536);
  });

  it("derives a maximum edge from a legacy fixed size", () => {
    expect(resolveImageEditMaxEdge("", "1152x1536")).toBe(1536);
  });

  it("leaves semantic model sizes in passthrough mode", () => {
    expect(resolveImageEditMaxEdge("", "1.5K")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm vitest run server/ai/imageEditSize.test.ts
```

Expected: FAIL because `server/ai/imageEditSize.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

Create `server/ai/imageEditSize.ts` with these exported behaviors:

```ts
const DIMENSION_STEP = 16;
const MIN_DIMENSION = 512;

function positiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveImageEditMaxEdge(configured: string, legacySize: string): number | undefined {
  const explicit = positiveInteger(configured.trim());
  if (explicit) return explicit;
  const match = legacySize.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) return undefined;
  return Math.max(Number(match[1]), Number(match[2]));
}

export function fitImageEditSize(width: number, height: number, maxEdge: number): string {
  if (![width, height, maxEdge].every(Number.isFinite) || width <= 0 || height <= 0 || maxEdge < MIN_DIMENSION) {
    throw new Error("原图尺寸或修图最大边配置无效");
  }
  const landscape = width >= height;
  const shortSource = landscape ? height : width;
  const longSource = landscape ? width : height;
  const alignedLong = Math.floor(maxEdge / DIMENSION_STEP) * DIMENSION_STEP;
  const alignedShort = Math.round((alignedLong * shortSource) / longSource / DIMENSION_STEP) * DIMENSION_STEP;
  if (alignedShort < MIN_DIMENSION) throw new Error("原图比例过于狭长，无法在不改变构图的情况下处理");
  return landscape ? `${alignedLong}x${alignedShort}` : `${alignedShort}x${alignedLong}`;
}
```

- [ ] **Step 4: Run the pure tests and verify GREEN**

Run `pnpm vitest run server/ai/imageEditSize.test.ts`.

Expected: one test file passes with no failures.

### Task 2: Integrate sizing into `aiEditImage`

**Files:**
- Modify: `server/_core/env.ts`
- Modify: `server/ai/gateway.ts`
- Modify: `server/ai/gateway-edit.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend gateway tests before production code**

Change the mocked environment to include:

```ts
arkImageEditMaxEdge: "1536",
arkImageEditSize: "1152x1536",
```

Add a small PNG buffer helper and stub `fetch` in each adaptive test. Assert:

```ts
expect(volcGenerateImage).toHaveBeenCalledWith({
  prompt: "保持构图",
  imageUrls: ["https://cdn.example/landscape.png"],
  size: "1536x1152",
});
```

Add a failure case where `fetch` returns undecodable bytes and assert `volcGenerateImage` was not called. Keep the existing 503 case and assert exactly one model call.

- [ ] **Step 2: Run gateway tests and verify RED**

Run:

```bash
pnpm vitest run server/ai/gateway-edit.test.ts
```

Expected: FAIL because the gateway still forwards the fixed `1152x1536` value and does not read dimensions first.

- [ ] **Step 3: Add environment configuration**

In `server/_core/env.ts`, add:

```ts
arkImageEditMaxEdge: process.env.ARK_IMAGE_EDIT_MAX_EDGE ?? "",
```

In `.env.example`, document:

```dotenv
# 修图最大边；设置后按原图比例计算 WIDTHxHEIGHT，1536 对应当前速度档
ARK_IMAGE_EDIT_MAX_EDGE=1536
# 旧部署兼容；固定 WIDTHxHEIGHT 会自动取较长边作为最大边
ARK_IMAGE_EDIT_SIZE=2K
```

- [ ] **Step 4: Read dimensions before the first model request**

In `server/ai/gateway.ts`, import `fitImageEditSize` and `resolveImageEditMaxEdge`. Add a local loader that fetches `imageUrl`, checks `response.ok`, parses `readImageDimensions`, and throws before calling Seedream when parsing fails.

Calculate:

```ts
const maxEdge = resolveImageEditMaxEdge(ENV.arkImageEditMaxEdge, ENV.arkImageEditSize);
let dimensions: ImageDimensions | undefined;
let size = ENV.arkImageEditSize;
if (maxEdge) {
  dimensions = await loadImageDimensions(params.imageUrl);
  size = fitImageEditSize(dimensions.width, dimensions.height, maxEdge);
}
```

Pass `size` to the first `volcGenerateImage` call. If a 400 unsupported-size error occurs, reuse `dimensions` when already loaded; otherwise load them once, then call the existing nearest-aspect fallback. Do not catch or retry any other error.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```bash
pnpm vitest run server/ai/imageEditSize.test.ts server/ai/gateway-edit.test.ts
```

Expected: both test files pass; horizontal calls use `1536x1152`, portrait calls use `1152x1536`, undecodable images cause zero Seedream calls, and 503 causes one call.

- [ ] **Step 6: Commit implementation**

Run:

```bash
git add .env.example server/_core/env.ts server/ai/gateway.ts server/ai/gateway-edit.test.ts server/ai/imageEditSize.ts server/ai/imageEditSize.test.ts
git commit -m "fix: preserve photo edit aspect ratio"
```

### Task 3: Full verification, push, and production deployment

**Files:**
- No additional tracked files expected.
- Update ignored local `.env` and production `/opt/lejoy-ai/.env` without displaying secrets.

- [ ] **Step 1: Run full server verification**

Run:

```bash
pnpm test
pnpm check
pnpm build
```

Expected: all commands exit 0 with zero test failures and zero TypeScript/build errors.

- [ ] **Step 2: Run mini-program production verification**

Run:

```bash
pnpm --dir miniprogram build:weapp:prod
```

Expected: Taro build exits 0 and the post-build check reports production API present with zero `127.0.0.1` occurrences.

- [ ] **Step 3: Update local ignored configuration**

Set only these non-secret lines in local `.env`:

```dotenv
ARK_IMAGE_EDIT_MAX_EDGE=1536
ARK_IMAGE_EDIT_SIZE=1152x1536
```

- [ ] **Step 4: Push the branch**

Run:

```bash
git push origin codex/m4-release-ready
```

Expected: remote branch advances through the design and implementation commits.

- [ ] **Step 5: Update production and deploy**

Over SSH, replace or append `ARK_IMAGE_EDIT_MAX_EDGE=1536` in `/opt/lejoy-ai/.env` without echoing any secrets, then run:

```bash
cd /opt/lejoy-ai
bash scripts/deploy/02-deploy.sh
```

Expected: repository updates to the new commit, production build succeeds, and PM2 reports one online `fork_mode` process.

- [ ] **Step 6: Verify production health and configuration**

Run:

```bash
curl --fail --silent --show-error https://api.hxzhineng.xyz/api/mp/health
```

Expected: `{"ok":true,"version":"1.0.0"}`. Verify only the two `ARK_IMAGE_EDIT_*` lines and PM2 mode/status; do not print the rest of `.env`.

- [ ] **Step 7: Report the testable outcome**

Report commit hashes, test/build results, deployed maximum edge, and the exact expected mappings (`3:4 → 1152x1536`, `4:3 → 1536x1152`, `16:9 → 1536x864`, `1:1 → 1536x1536`). State that a real horizontal-photo quality check remains the user's acceptance step.
