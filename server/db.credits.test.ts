import { describe, expect, it, vi } from "vitest";
import { consumeCreditsInDatabase, refundCreditsInDatabase } from "./db";

type FakeOptions = {
  affectedRows: number;
  balance?: number;
  insertError?: Error;
};

function createFakeDatabase(options: FakeOptions) {
  const updateWhere = vi.fn().mockResolvedValue([
    { affectedRows: options.affectedRows },
    [],
  ]);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectLimit = vi.fn().mockResolvedValue(
    options.balance === undefined ? [] : [{ credits: options.balance }],
  );
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const insertValues = vi.fn(async () => {
    if (options.insertError) throw options.insertError;
  });
  const insert = vi.fn(() => ({ values: insertValues }));

  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<number>) =>
    callback({ update, select, insert }),
  );

  return {
    db: { transaction },
    spies: { transaction, updateWhere, insertValues },
  };
}

describe("consumeCreditsInDatabase", () => {
  it("在同一事务内扣减并记录流水", async () => {
    const { db, spies } = createFakeDatabase({ affectedRows: 1, balance: 99 });

    await expect(
      consumeCreditsInDatabase(db as never, 7, 1, "copywriter", "生成文案"),
    ).resolves.toBe(99);

    expect(spies.transaction).toHaveBeenCalledOnce();
    expect(spies.updateWhere).toHaveBeenCalledOnce();
    expect(spies.insertValues).toHaveBeenCalledWith({
      userId: 7,
      amount: -1,
      type: "consume",
      feature: "copywriter",
      description: "生成文案",
      balanceAfter: 99,
    });
  });

  it("条件扣减未命中时拒绝透支且不写流水", async () => {
    const { db, spies } = createFakeDatabase({ affectedRows: 0, balance: 0 });

    await expect(
      consumeCreditsInDatabase(db as never, 7, 1, "copywriter", "生成文案"),
    ).rejects.toThrow("积分不足，当前余额 0，需要 1 积分");

    expect(spies.insertValues).not.toHaveBeenCalled();
  });

  it("用户不存在时返回明确错误", async () => {
    const { db, spies } = createFakeDatabase({ affectedRows: 0 });

    await expect(
      consumeCreditsInDatabase(db as never, 404, 1, "copywriter", "生成文案"),
    ).rejects.toThrow("用户不存在");

    expect(spies.insertValues).not.toHaveBeenCalled();
  });

  it("流水写入失败时让事务整体失败", async () => {
    const { db } = createFakeDatabase({
      affectedRows: 1,
      balance: 99,
      insertError: new Error("insert failed"),
    });

    await expect(
      consumeCreditsInDatabase(db as never, 7, 1, "copywriter", "生成文案"),
    ).rejects.toThrow("insert failed");
  });

  it("拒绝非正整数扣减", async () => {
    const { db, spies } = createFakeDatabase({ affectedRows: 1, balance: 100 });

    await expect(
      consumeCreditsInDatabase(db as never, 7, 0, "copywriter", "生成文案"),
    ).rejects.toThrow("积分扣减数量必须为正整数");

    expect(spies.transaction).not.toHaveBeenCalled();
  });
});

describe("refundCreditsInDatabase", () => {
  it("在同一事务内退还积分并记录 recharge 流水", async () => {
    const { db, spies } = createFakeDatabase({ affectedRows: 1, balance: 100 });

    await expect(
      refundCreditsInDatabase(db as never, 7, 2, "photo_restore", "照片修复生成失败退还"),
    ).resolves.toBe(100);

    expect(spies.transaction).toHaveBeenCalledOnce();
    expect(spies.insertValues).toHaveBeenCalledWith({
      userId: 7,
      amount: 2,
      type: "recharge",
      feature: "photo_restore",
      description: "照片修复生成失败退还",
      balanceAfter: 100,
    });
  });
});
