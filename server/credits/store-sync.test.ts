import { describe, expect, it, vi } from "vitest";
import { getLastStoreSync, planStoreSync, recordStoreSyncFailure, syncStoreCatalog } from "./store-sync";

const format = { formatId: "community", formatName: "灵芝水铺·社区店" };
const current = [
  { id: 1, code: "LZ_A", name: "南京旧名", sourceFormatId: "community", sourceStoreId: "nanjing", sourceFormatName: "旧业态", enabled: 1 },
  { id: 2, code: "SH001", name: "旧手工门店", sourceFormatId: null, sourceStoreId: null, sourceFormatName: null, enabled: 1 },
  { id: 3, code: "LZ_B", name: "已移除门店", sourceFormatId: "community", sourceStoreId: "removed", sourceFormatName: "社区店", enabled: 1 },
];

describe("人工门店同步", () => {
  it("按来源复合键规划新增、改名和停用，而不删除历史门店", () => {
    const plan = planStoreSync(current, [
      { ...format, storeId: "nanjing", storeName: "南京新名" },
      { ...format, storeId: "suzhou", storeName: "苏州店" },
    ]);
    expect(plan.add.map(row => row.storeId)).toEqual(["suzhou"]);
    expect(plan.update.map(change => change.id)).toEqual([1]);
    expect(plan.disableIds).toEqual([2, 3]);
  });

  it("重复同步不改变门店，回归门店重新启用", () => {
    const row = { ...format, storeId: "nanjing", storeName: "南京店" };
    expect(planStoreSync([{ ...current[0], name: "南京店", sourceFormatName: format.formatName }], [row])).toEqual({ add: [], update: [], disableIds: [] });
    const returned = planStoreSync([{ ...current[0], name: "南京店", sourceFormatName: format.formatName, enabled: 0 }], [row]);
    expect(returned.update).toEqual([{ id: 1, row }]);
  });

  it("拒绝空目录和重复复合键，不开启数据库事务", async () => {
    const db = { transaction: vi.fn() };
    await expect(syncStoreCatalog(db as never, [], 3)).rejects.toThrow();
    await expect(syncStoreCatalog(db as never, [{ ...format, storeId: "a", storeName: "A" }, { ...format, storeId: "a", storeName: "A" }], 3)).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("在一次数据库事务中写入变化和成功审计", async () => {
    const writes: Array<{ table: unknown; values: unknown }> = [];
    const existing = [...current, { id: 4, code: "LZ_C", name: "回归店", sourceFormatId: "community", sourceStoreId: "return", sourceFormatName: format.formatName, enabled: 0 }];
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(async () => existing) })),
      insert: vi.fn((table: unknown) => ({ values: vi.fn(async (values: unknown) => { writes.push({ table, values }); return [{ insertId: 9 }]; }) })),
      update: vi.fn((table: unknown) => ({ set: vi.fn((values: unknown) => ({ where: vi.fn(async () => { writes.push({ table, values }); return [{ affectedRows: 1 }]; }) })) })),
    };
    const db = { transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) };
    const result = await syncStoreCatalog(db as never, [
      { ...format, storeId: "nanjing", storeName: "南京新名" },
      { ...format, storeId: "suzhou", storeName: "苏州店" },
      { ...format, storeId: "return", storeName: "回归店" },
    ], 3);
    expect(result).toMatchObject({ insertedCount: 1, updatedCount: 2, disabledCount: 2 });
    expect(result.changedStores).toEqual([
      { name: "苏州店", change: "added" },
      { name: "南京新名", change: "renamed", previousName: "南京旧名" },
      { name: "回归店", change: "reactivated" },
      { name: "旧手工门店", change: "disabled" },
      { name: "已移除门店", change: "disabled" },
    ]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(writes.some(entry => typeof entry.values === "object" && entry.values !== null && "status" in entry.values && entry.values.status === "success")).toBe(true);
  });

  it("再次同步相同目录时不返回旧的变化清单", async () => {
    const existing = [{ ...current[0], name: "南京店", sourceFormatName: format.formatName }];
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(async () => existing) })),
      insert: vi.fn(() => ({ values: vi.fn(async () => {}) })),
    };
    const db = { transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) };
    const result = await syncStoreCatalog(db as never, [{ ...format, storeId: "nanjing", storeName: "南京店" }], 3);
    expect(result.changedStores).toEqual([]);
  });

  it("只记录失败码，且最近成功时间不被失败覆盖", async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const db = {
      insert: vi.fn(() => ({ values: vi.fn(async (value: Record<string, unknown>) => { recorded.push(value); }) })),
      select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ createdAt: new Date("2026-09-18T00:00:00Z"), insertedCount: 2, updatedCount: 1, disabledCount: 0 }] }) }) }) })),
    };
    await recordStoreSyncFailure(db as never, 3, "SOURCE_UNAVAILABLE", new Date("2026-09-18T00:01:00Z"));
    expect(recorded).toEqual([{ adminId: 3, status: "failure", errorCode: "SOURCE_UNAVAILABLE", createdAt: new Date("2026-09-18T00:01:00Z") }]);
    expect(await getLastStoreSync(db as never)).toMatchObject({ insertedCount: 2, updatedCount: 1, disabledCount: 0 });
  });
});
