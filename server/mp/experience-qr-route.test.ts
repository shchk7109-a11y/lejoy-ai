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
