import { describe, expect, it } from "vitest";
import { withCreditCharge, type CreditOperations } from "./credits-charge";

describe("withCreditCharge", () => {
  it("生成失败时恢复余额并写入 consume/recharge 两条流水", async () => {
    let balance = 100;
    const transactions: Array<{ type: "consume" | "recharge"; description: string }> = [];
    const operations: CreditOperations = {
      consume: async (_userId, amount, _feature, description) => {
        balance -= amount;
        transactions.push({ type: "consume", description });
        return balance;
      },
      refund: async (_userId, amount, _feature, description) => {
        balance += amount;
        transactions.push({ type: "recharge", description });
        return balance;
      },
    };

    await expect(withCreditCharge(
      7,
      2,
      "photo_restore",
      async () => { throw new Error("模型不可用"); },
      "照片修复",
      operations,
    )).rejects.toThrow("模型不可用");

    expect(balance).toBe(100);
    expect(transactions).toEqual([
      { type: "consume", description: "照片修复" },
      { type: "recharge", description: "照片修复生成失败退还" },
    ]);
  });

  it("生成成功时返回结果与扣费后余额且不退款", async () => {
    const operations: CreditOperations = {
      consume: async () => 98,
      refund: async () => { throw new Error("不应退款"); },
    };

    await expect(withCreditCharge(
      7,
      2,
      "photo_restore",
      async () => "result-url",
      "照片修复",
      operations,
    )).resolves.toEqual({ value: "result-url", credits: 98 });
  });
});
