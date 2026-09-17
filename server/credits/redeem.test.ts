import { describe, expect, it, vi } from "vitest";
import { creditCodeBatches, creditCodes, creditTransactions, users } from "../../drizzle/schema";
import { createCode } from "./codes";
import { RedeemError, redeemCodeInDatabase } from "./redeem";

function fakeDb(options: { code?: Record<string, unknown>; batch?: Record<string, unknown>; user?: Record<string, unknown>; claimRows?: number; ledgerError?: boolean } = {}) {
  const code = options.code ?? { id: 8, batchId: 3, status: "unused" };
  const batch = options.batch ?? { id: 3, status: "active", amount: 20, expiresAt: new Date("2027-01-01") };
  const user = options.user ?? { credits: 120 };
  const inserted: Array<{ table: unknown; value: unknown }> = [];
  const db: Record<string, unknown> = {};
  db.select = vi.fn(() => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === creditCodes ? (options.code === null ? [] : [code]) : table === creditCodeBatches ? [batch] : [user] }) }) }));
  db.update = vi.fn((table: unknown) => ({ set: () => ({ where: async () => [{ affectedRows: table === creditCodes ? options.claimRows ?? 1 : 1 }] }) }));
  db.insert = vi.fn((table: unknown) => ({ values: async (value: unknown) => { if (options.ledgerError) throw new Error("ledger failed"); inserted.push({ table, value }); return [{ insertId: 15 }]; } }));
  db.transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));
  return { db, inserted };
}

describe("redeem code transaction", () => {
  const code = createCode();
  const now = new Date("2026-01-01");
  it("claims one unused code, atomically credits user and links one ledger entry", async () => {
    const { db, inserted } = fakeDb();
    await expect(redeemCodeInDatabase(db as never, 7, code, now)).resolves.toEqual({ awardedCredits: 20, balance: 120, transactionId: 15 });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(inserted).toEqual([{ table: creditTransactions, value: { userId: 7, amount: 20, type: "redeem", feature: "store_code", creditCodeId: 8, description: "门店兑换码赠送积分", balanceAfter: 120 } }]);
  });
  it("rejects a racing second claim and does not credit user", async () => {
    const { db, inserted } = fakeDb({ claimRows: 0 });
    await expect(redeemCodeInDatabase(db as never, 7, code, now)).rejects.toMatchObject({ code: "CODE_USED" });
    expect((db.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([]);
  });
  it("rejects pending, expired and revoked codes before any balance change", async () => {
    for (const [options, expected] of [
      [{ batch: { id: 3, status: "pending", amount: 20, expiresAt: new Date("2027-01-01") } }, "CODE_INACTIVE"],
      [{ batch: { id: 3, status: "active", amount: 20, expiresAt: new Date("2025-01-01") } }, "CODE_EXPIRED"],
      [{ code: { id: 8, batchId: 3, status: "revoked" } }, "CODE_INACTIVE"],
    ] as const) {
      const { db, inserted } = fakeDb(options);
      await expect(redeemCodeInDatabase(db as never, 7, code, now)).rejects.toMatchObject({ code: expected });
      expect((db.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
      expect(inserted).toEqual([]);
    }
  });
  it("propagates ledger failure so claim and balance transaction rolls back", async () => {
    const { db } = fakeDb({ ledgerError: true });
    await expect(redeemCodeInDatabase(db as never, 7, code, now)).rejects.toThrow("ledger failed");
  });
  it("rejects malformed codes without reaching DB", async () => {
    const { db } = fakeDb();
    await expect(redeemCodeInDatabase(db as never, 7, "not a code", now)).rejects.toBeInstanceOf(RedeemError);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
