import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { creditCodeBatches, creditCodes, creditTransactions, stores, users } from "../../drizzle/schema";
import { sha256 } from "../hq/auth-crypto";
import { createCode, normalizeCode } from "./codes";
import { redeemCodeInDatabase } from "./redeem";

describe("redemption against an isolated MySQL test database", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("allows exactly one concurrent winner and rolls back on ledger failure", async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (!url.pathname.slice(1).endsWith("_test")) throw new Error("TEST_DATABASE_URL 必须指向独立的 *_test 数据库");
    const pool = mysql.createPool(process.env.TEST_DATABASE_URL!);
    const db = drizzle(pool);
    const suffix = randomBytes(8).toString("hex");
    const userIds: number[] = [];
    let storeId = 0; let batchId = 0; const codeIds: number[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        const result = await db.insert(users).values({ openId: `redeem_test_${suffix}_${i}`, credits: 10 });
        userIds.push(Number(result[0].insertId));
      }
      const storeResult = await db.insert(stores).values({ code: `TEST_${suffix.toUpperCase()}`, name: "并发测试店" });
      storeId = Number(storeResult[0].insertId);
      const batchResult = await db.insert(creditCodeBatches).values({ storeId, amount: 20, quantity: 2, expiresAt: new Date(Date.now() + 86_400_000), purpose: "promotion", receiptRef: `TEST-${suffix}`, status: "active", createdBy: 1, activatedBy: 1, activatedAt: new Date() });
      batchId = Number(batchResult[0].insertId);
      const code = createCode();
      const first = await db.insert(creditCodes).values({ batchId, codeHash: sha256(normalizeCode(code)) });
      codeIds.push(Number(first[0].insertId));
      const outcomes = await Promise.allSettled(userIds.map(id => redeemCodeInDatabase(db, id, code)));
      expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
      const ledger = await db.select().from(creditTransactions).where(eq(creditTransactions.creditCodeId, codeIds[0]));
      expect(ledger).toHaveLength(1);
      const [claimed] = await db.select().from(creditCodes).where(eq(creditCodes.id, codeIds[0]));
      expect(claimed.status).toBe("redeemed");

      const rollbackCode = createCode();
      const second = await db.insert(creditCodes).values({ batchId, codeHash: sha256(normalizeCode(rollbackCode)) });
      codeIds.push(Number(second[0].insertId));
      await db.insert(creditTransactions).values({ userId: userIds[0], amount: 0, type: "recharge", feature: "test_unique_constraint", creditCodeId: codeIds[1], balanceAfter: 10 });
      const [before] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userIds[1]));
      await expect(redeemCodeInDatabase(db, userIds[1], rollbackCode)).rejects.toThrow();
      const [after] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userIds[1]));
      const [unclaimed] = await db.select().from(creditCodes).where(eq(creditCodes.id, codeIds[1]));
      expect(after.credits).toBe(before.credits);
      expect(unclaimed.status).toBe("unused");
    } finally {
      for (const id of codeIds) await db.delete(creditTransactions).where(eq(creditTransactions.creditCodeId, id));
      for (const id of codeIds) await db.delete(creditCodes).where(eq(creditCodes.id, id));
      if (batchId) await db.delete(creditCodeBatches).where(eq(creditCodeBatches.id, batchId));
      if (storeId) await db.delete(stores).where(eq(stores.id, storeId));
      for (const id of userIds) await db.delete(users).where(eq(users.id, id));
      await pool.end();
    }
  }, 30_000);
});
