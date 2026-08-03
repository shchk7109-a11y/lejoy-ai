import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageJsonPath = join(repositoryRoot, "miniprogram", "package.json");
const validatorPath = join(repositoryRoot, "miniprogram", "scripts", "verify-production-build.mjs");

function validateFixture(contents: string) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "lejoy-weapp-build-"));
  writeFileSync(join(fixtureDir, "app.js"), contents, "utf8");
  return spawnSync(process.execPath, [validatorPath, fixtureDir], { encoding: "utf8" });
}

describe("生产小程序构建门禁", () => {
  it("生产构建固定注入 API 地址并在构建后运行产物校验", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.scripts["build:weapp:prod"]).toBe(
      "TARO_APP_API_BASE_URL=https://api.hxzhineng.xyz taro build --type weapp && node scripts/verify-production-build.mjs",
    );
  });

  it("仅包含生产 API 地址的产物通过校验", () => {
    const result = validateFixture('const api = "https://api.hxzhineng.xyz";');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("生产 API 地址命中次数: 1");
    expect(result.stdout).toContain("127.0.0.1 命中次数: 0");
    expect(result.stdout).toContain("生产小程序 API 地址校验通过");
  });

  it("缺少生产 API 地址时校验失败", () => {
    const result = validateFixture('const api = "https://example.com";');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("未找到 api.hxzhineng.xyz");
  });

  it("仍包含本地 API 地址时校验失败", () => {
    const result = validateFixture('const prod = "https://api.hxzhineng.xyz"; const local = "http://127.0.0.1:3000";');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("仍包含 127.0.0.1");
  });

  it("开发者工具模板告警登记为已知问题", () => {
    const checklist = readFileSync(join(repositoryRoot, "docs", "提审准备清单.md"), "utf8");

    expect(checklist).toContain("pnpm --dir miniprogram build:weapp:prod");
    expect(checklist).not.toContain("pnpm build:mp");
    expect(checklist).toContain("Template tmpl_0_i not found");
    expect(checklist).toContain("暂不处理");
  });
});
