import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const moduleUrl = new URL("../scripts/admin-credits.ts", import.meta.url);

async function loadModule() {
  expect(existsSync(moduleUrl)).toBe(true);
  return import("../scripts/admin-credits");
}

describe("管理员积分 CLI 参数", () => {
  it("命令入口显式退出，避免数据库连接池挂住进程", () => {
    const source = readFileSync(moduleUrl, "utf8");
    expect(source).toContain("process.exit(exitCode)");
  });

  it("解析三种受支持命令", async () => {
    const { parseAdminCreditsArgs } = await loadModule();

    expect(parseAdminCreditsArgs(["list"])).toEqual({ kind: "list" });
    expect(parseAdminCreditsArgs(["recharge", "7", "50", "体验赠送"])).toEqual({
      kind: "recharge",
      userId: 7,
      amount: 50,
      note: "体验赠送",
    });
    expect(parseAdminCreditsArgs(["set-admin", "9"])).toEqual({
      kind: "set-admin",
      userId: 9,
    });
  });

  it.each([
    [],
    ["unknown"],
    ["list", "extra"],
    ["recharge", "0", "10"],
    ["recharge", "1", "0"],
    ["recharge", "1.5", "10"],
    ["recharge", "1", "2.5"],
    ["set-admin", "-1"],
    ["set-admin", "1", "extra"],
  ])("拒绝非法参数 %#", async (...args: string[]) => {
    const { parseAdminCreditsArgs } = await loadModule();
    expect(() => parseAdminCreditsArgs(args)).toThrow();
  });

  it("OpenID 只显示前六位并打码", async () => {
    const { maskOpenId } = await loadModule();
    expect(maskOpenId("abcdefghijklmnop")).toBe("abcdef***");
    expect(maskOpenId("abc")).toBe("abc***");
  });

  it("数据库不可用时明确失败而不是返回空用户", async () => {
    const { requireDatabase } = await loadModule();
    await expect(requireDatabase(async () => null)).rejects.toThrow(
      "数据库不可用",
    );
  });
});

describe("管理员积分 CLI 执行", () => {
  it("list 输出脱敏用户信息", async () => {
    const { runAdminCredits } = await loadModule();
    const write = vi.fn();

    await runAdminCredits(
      { kind: "list" },
      {
        getAllUsers: vi.fn(async () => [
          {
            id: 7,
            name: "体验用户",
            openId: "abcdefghijklmnop",
            credits: 100,
            createdAt: new Date("2026-08-02T00:00:00.000Z"),
          },
        ]),
        rechargeCredits: vi.fn(),
        setAdmin: vi.fn(),
      },
      write,
    );

    expect(write).toHaveBeenCalledWith(expect.stringContaining("abcdef***"));
    expect(write).not.toHaveBeenCalledWith(
      expect.stringContaining("abcdefghijklmnop"),
    );
  });

  it("recharge 调用现有充值能力并输出新余额", async () => {
    const { runAdminCredits } = await loadModule();
    const rechargeCredits = vi.fn(async () => 150);
    const write = vi.fn();

    await runAdminCredits(
      { kind: "recharge", userId: 7, amount: 50, note: "体验赠送" },
      { getAllUsers: vi.fn(), rechargeCredits, setAdmin: vi.fn() },
      write,
    );

    expect(rechargeCredits).toHaveBeenCalledWith(7, 50, "体验赠送");
    expect(write).toHaveBeenCalledWith(
      "充值成功：用户 7，新增 50，当前余额 150",
    );
  });

  it("set-admin 调用角色更新能力", async () => {
    const { runAdminCredits } = await loadModule();
    const setAdmin = vi.fn(async () => undefined);

    await runAdminCredits(
      { kind: "set-admin", userId: 9 },
      { getAllUsers: vi.fn(), rechargeCredits: vi.fn(), setAdmin },
      vi.fn(),
    );

    expect(setAdmin).toHaveBeenCalledWith(9);
  });
});
