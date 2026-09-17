import { describe, expect, it, vi } from "vitest";
import { creditCodeBatchEvents, creditCodeBatches, creditCodes, stores } from "../../drizzle/schema";
import { createCode, createCreditCodeService, normalizeCode, validateBatchInput, summarizeInventory } from "./codes";

describe("credit code rules", () => {
  it("generates non-ambiguous 12-character codes and hashes only normalized values", () => {
    const values = Array.from({ length: 1000 }, () => createCode());
    expect(new Set(values).size).toBe(1000);
    for (const value of values) {
      expect(value).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(normalizeCode(value.toLowerCase())).toBe(value.replaceAll("-", ""));
    }
  });
  it("rejects invalid batches before writing", () => {
    const input = { storeId: 1, amount: 20, quantity: 10, expiresAt: new Date("2027-01-01"), purpose: "purchase" as const, receiptRef: "OFFLINE-1" };
    expect(validateBatchInput(input, new Date("2026-01-01"))).toEqual(input);
    for (const bad of [{ ...input, quantity: 1001 }, { ...input, amount: 0 }, { ...input, expiresAt: new Date("2025-01-01") }, { ...input, purpose: "promotion" as const, receiptRef: "" }]) {
      expect(() => validateBatchInput(bad, new Date("2026-01-01"))).toThrow();
    }
    expect(() => validateBatchInput({ ...input, purpose: "promotion", approver: "", approvalReason: "" }, new Date("2026-01-01"))).toThrow();
    expect(validateBatchInput({ ...input, purpose: "promotion", approver: "总部负责人", approvalReason: "开业活动赠码" }, new Date("2026-01-01"))).toMatchObject({ approver: "总部负责人" });
  });
  it("keeps allocated inventory partitioned without counting pending batch as issued", () => {
    expect(summarizeInventory({ status: "pending", expiresAt: new Date("2027-01-01") }, [], new Date("2026-01-01"))).toEqual({ allocated: 0, redeemed: 0, unused: 0, expired: 0, revoked: 0 });
    const summary = summarizeInventory({ status: "active", expiresAt: new Date("2025-01-01") }, ["redeemed", "unused", "revoked"], new Date("2026-01-01"));
    expect(summary).toEqual({ allocated: 3, redeemed: 1, unused: 0, expired: 1, revoked: 1 });
    expect(summary.allocated).toBe(summary.redeemed + summary.unused + summary.expired + summary.revoked);
  });

  it("creates a code-free pending batch, then persists only hashes during single activation", async () => {
    const now = new Date("2026-01-01");
    const input = { storeId: 1, amount: 20, quantity: 10, expiresAt: new Date("2027-01-01"), purpose: "purchase" as const, receiptRef: "OFFLINE-1" };
    const inserted: Array<{ table: unknown; values: unknown }> = [];
    const db: Record<string, unknown> = {};
    let status: "pending" | "active" = "pending";
    db.select = vi.fn(() => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === stores ? [{ id: 1, enabled: 1 }] : table === creditCodeBatchEvents ? [] : [{ id: 7, ...input, status }] }) }) }));
    db.insert = vi.fn((table: unknown) => ({ values: async (values: unknown) => { inserted.push({ table, values }); return [{ insertId: 7 }]; } }));
    db.update = vi.fn(() => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }));
    db.transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));
    const service = createCreditCodeService(db as never);
    expect(await service.createBatch(input, 3, now)).toEqual({ id: 7, status: "pending", codeCount: 0 });
    expect(inserted.some(entry => entry.table === creditCodes)).toBe(false);
    await service.createBatch({ ...input, purpose: "promotion", approver: "总部负责人", approvalReason: "开业活动赠码" }, 3, now);
    expect(inserted.some(entry => entry.table === creditCodeBatchEvents && String((entry.values as { reason?: string }).reason).includes("审批人:总部负责人"))).toBe(true);
    const activated = await service.activateBatch(7, 3, now);
    status = "active";
    expect(activated.codeCount).toBe(10);
    expect(activated.csv.split("\r\n").length).toBe(12);
    const stored = inserted.find(entry => entry.table === creditCodes)?.values as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(10);
    expect(stored[0]).toEqual({ batchId: 7, codeHash: expect.stringMatching(/^[a-f0-9]{64}$/), status: "unused" });
    expect(JSON.stringify(stored)).not.toContain(activated.csv.split("\r\n")[1].split(",")[0]);
    expect(inserted.some(entry => entry.table === creditCodeBatches)).toBe(true);
    await service.confirmDelivery(7, 3, "已通过受控渠道交付店长", now);
    expect(inserted.some(entry => entry.table === creditCodeBatchEvents && (entry.values as { action?: string }).action === "delivery_confirmed")).toBe(true);
  });
});
