# 体验二维码旧路径兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让指向 `pages/index/index` 的现有体验二维码正常显示现有登录页，同时不改变小程序默认启动页。

**Architecture:** 在页面清单末尾登记一个兼容路由，并用薄包装页面直接渲染现有 `LoginPage`。测试读取真实配置和页面源码，确保兼容路由存在且没有复制登录逻辑；生产构建再验证最终产物和 API 地址。

**Tech Stack:** Taro 4、React 18、TypeScript、Vitest、微信小程序生产构建

---

## 文件结构

- 新建 `miniprogram/src/pages/index/index.tsx`：旧二维码路径的薄兼容页面。
- 修改 `miniprogram/src/app.config.ts`：在页面清单末尾登记兼容路由。
- 新建 `server/mp/experience-qr-route.test.ts`：覆盖路由声明和登录页复用约束。

### Task 1: 增加体验二维码兼容入口

**Files:**
- Create: `server/mp/experience-qr-route.test.ts`
- Create: `miniprogram/src/pages/index/index.tsx`
- Modify: `miniprogram/src/app.config.ts`

- [ ] **Step 1: 编写失败测试**

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appConfigPath = new URL("../../miniprogram/src/app.config.ts", import.meta.url);
const legacyPagePath = new URL("../../miniprogram/src/pages/index/index.tsx", import.meta.url);

describe("体验二维码旧路径兼容", () => {
  it("在页面清单末尾登记 pages/index/index，默认登录页保持不变", () => {
    const appConfig = readFileSync(appConfigPath, "utf8");
    expect(appConfig.indexOf('"pages/login/index"')).toBeLessThan(
      appConfig.indexOf('"pages/index/index"'),
    );
    expect(appConfig).toContain('"pages/index/index"');
  });

  it("兼容页面复用现有 LoginPage，不复制登录实现", () => {
    expect(existsSync(legacyPagePath)).toBe(true);
    if (!existsSync(legacyPagePath)) return;
    const legacyPage = readFileSync(legacyPagePath, "utf8");
    expect(legacyPage).toContain('import LoginPage from "../login"');
    expect(legacyPage).toContain("return <LoginPage />");
    expect(legacyPage).not.toContain("Taro.login");
    expect(legacyPage).not.toContain("mpApi.login");
  });
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `pnpm vitest run server/mp/experience-qr-route.test.ts`

Expected: FAIL，因为 `app.config.ts` 尚无 `pages/index/index`，兼容页面文件也不存在。

- [ ] **Step 3: 添加最小实现**

在 `miniprogram/src/app.config.ts` 的 `pages` 数组末尾添加：

```ts
"pages/index/index",
```

创建 `miniprogram/src/pages/index/index.tsx`：

```tsx
import LoginPage from "../login";

export default function LegacyIndexPage() {
  return <LoginPage />;
}
```

- [ ] **Step 4: 运行针对性测试并确认通过**

Run: `pnpm vitest run server/mp/experience-qr-route.test.ts`

Expected: 2 tests passed。

- [ ] **Step 5: 提交兼容入口**

```bash
git add server/mp/experience-qr-route.test.ts miniprogram/src/app.config.ts miniprogram/src/pages/index/index.tsx
git commit -m "fix: support legacy experience QR route"
```

### Task 2: 完整验证、生产构建与推送

**Files:**
- Verify: `miniprogram/dist/app.json`
- Verify: `miniprogram/dist/pages/index/index.js`
- Verify: `miniprogram/dist/pages/index/index.json`
- Verify: `miniprogram/dist/pages/index/index.wxml`
- Verify: `miniprogram/dist/pages/index/index.wxss`

- [ ] **Step 1: 运行完整测试和类型检查**

Run: `pnpm test && pnpm check && pnpm check:mp`

Expected: 所有非联网测试通过；无对应密钥的联网测试保持 skip；两个 TypeScript 检查退出码为 0。

- [ ] **Step 2: 执行生产构建门禁**

Run: `pnpm --dir miniprogram build:weapp:prod`

Expected: 构建退出码为 0，输出包含：

```text
生产 API 地址命中次数: 1
127.0.0.1 命中次数: 0
生产小程序 API 地址校验通过
```

- [ ] **Step 3: 核对兼容路由产物**

```bash
node -e 'const fs=require("fs");const app=JSON.parse(fs.readFileSync("miniprogram/dist/app.json","utf8"));const route="pages/index/index";const files=[".js",".json",".wxml",".wxss"].map(ext=>`miniprogram/dist/${route}${ext}`);if(!app.pages.includes(route)||files.some(file=>!fs.existsSync(file))){process.exit(1)}console.log(`legacy_route=${route} artifacts=${files.length}`)'
```

Expected: `legacy_route=pages/index/index artifacts=4`。

- [ ] **Step 4: 核对提交范围并推送**

```bash
git diff --check
git status --short
git push origin codex/m4-release-ready
```

Expected: 仅保留用户已有的 `miniprogram/project.config.json`、`.DS_Store`、`miniprogram/project.private.config.json` 本地状态；远端分支更新成功。
