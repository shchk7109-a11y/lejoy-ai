import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { creditCodeBatches, creditCodes, creditTransactions, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { sha256 } from "../hq/auth-crypto";
import { normalizeCode } from "./codes";

type Database = ReturnType<typeof drizzle>;
export type RedeemCode = "INVALID_CODE" | "CODE_USED" | "CODE_EXPIRED" | "CODE_INACTIVE";
export class RedeemError extends Error {
  constructor(public readonly code: RedeemCode) { super(code); }
}

export async function redeemCodeInDatabase(db: Database, userId: number, rawCode: string, now = new Date()) {
  const code = normalizeCode(rawCode);
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code)) throw new RedeemError("INVALID_CODE");
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("无效用户");
  return db.transaction(async tx => {
    const [found] = await tx.select().from(creditCodes).where(eq(creditCodes.codeHash, sha256(code))).limit(1);
    if (!found) throw new RedeemError("INVALID_CODE");
    if (found.status === "redeemed") throw new RedeemError("CODE_USED");
    if (found.status === "revoked") throw new RedeemError("CODE_INACTIVE");
    const [batch] = await tx.select().from(creditCodeBatches).where(eq(creditCodeBatches.id, found.batchId)).limit(1);
    if (!batch || batch.status !== "active") throw new RedeemError("CODE_INACTIVE");
    if (batch.expiresAt <= now) throw new RedeemError("CODE_EXPIRED");
    const claimed = await tx.update(creditCodes).set({ status: "redeemed", redeemedBy: userId, redeemedAt: now })
      .where(and(eq(creditCodes.id, found.id), eq(creditCodes.status, "unused")));
    if (claimed[0].affectedRows !== 1) throw new RedeemError("CODE_USED");
    const credited = await tx.update(users).set({ credits: sql`${users.credits} + ${batch.amount}` }).where(eq(users.id, userId));
    if (credited[0].affectedRows !== 1) throw new Error("用户不存在");
    const [account] = await tx.select({ credits: users.credits }).from(users).where(eq(users.id, userId)).limit(1);
    if (!account) throw new Error("用户不存在");
    const result = await tx.insert(creditTransactions).values({
      userId, amount: batch.amount, type: "redeem", feature: "store_code",
      creditCodeId: found.id, description: "门店兑换码赠送积分", balanceAfter: account.credits,
    });
    return { awardedCredits: batch.amount, balance: account.credits, transactionId: Number(result[0].insertId) };
  });
}

export async function redeemCode(userId: number, code: string, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  return redeemCodeInDatabase(db, userId, code, now);
}
