import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "../../drizzle/schema";

describe("积分兑换码数据结构", () => {
  it("定义独立的总部身份、门店和兑换码表", () => {
    const expected = {
      hqAdminAccounts: "hq_admin_accounts",
      hqAdminSessions: "hq_admin_sessions",
      stores: "stores",
      creditCodeBatches: "credit_code_batches",
      creditCodes: "credit_codes",
      creditCodeBatchEvents: "credit_code_batch_events",
    } as const;

    for (const [key, tableName] of Object.entries(expected)) {
      const table = (schema as Record<string, unknown>)[key];
      expect(table, `${key} 未定义`).toBeDefined();
      expect(getTableName(table as Parameters<typeof getTableName>[0])).toBe(tableName);
    }
  });

  it("兑换流水具有独立类型和唯一的码关联列", () => {
    const columns = getTableColumns(schema.creditTransactions);
    expect(columns).toHaveProperty("creditCodeId");
    expect(columns.type.enumValues).toContain("redeem");
  });

  it("门店镜像以来源业态和门店为身份，并记录人工同步", () => {
    const columns = getTableColumns(schema.stores);
    expect(columns).toHaveProperty("sourceFormatId");
    expect(columns).toHaveProperty("sourceStoreId");
    expect(columns).toHaveProperty("sourceFormatName");
    expect(columns).toHaveProperty("lastSyncedAt");
    expect(columns.sourceFormatId.notNull).toBe(false);
    expect(columns.sourceStoreId.notNull).toBe(false);
    expect(getTableName(schema.storeSyncRuns)).toBe("store_sync_runs");
  });

  it("旧门店批次仍可保留，而新批次可指向具名非门店收件人", () => {
    const columns = getTableColumns(schema.creditCodeBatches);
    expect(columns.storeId.notNull).toBe(false);
    expect(columns).toHaveProperty("targetKind");
    expect(columns).toHaveProperty("recipientLabel");
    expect(columns.targetKind.default).toBe("store");
  });
});
