import { randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { creditCodeBatchEvents, creditCodeBatches, creditCodes, stores } from "../../drizzle/schema";
import { sha256 } from "../hq/auth-crypto";
import { getDb } from "../db";

type Database = ReturnType<typeof drizzle>;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export type BatchInput = { storeId: number; amount: number; quantity: number; expiresAt: Date; purpose: "purchase" | "promotion"; receiptRef: string; approver?: string; approvalReason?: string };

export function normalizeCode(input: string): string { return input.replace(/[\s-]/g, "").toUpperCase(); }
export function createCode(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}
export function validateBatchInput(input: BatchInput, now = new Date()): BatchInput {
  if (!Number.isSafeInteger(input.storeId) || input.storeId <= 0 ||
      !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000 ||
      !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000 ||
      !(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= now ||
      !["purchase", "promotion"].includes(input.purpose) ||
      typeof input.receiptRef !== "string" || input.receiptRef.trim().length < 1 || input.receiptRef.length > 160 ||
      (input.purpose === "promotion" && (typeof input.approver !== "string" || input.approver.trim().length < 2 || input.approver.length > 80 || typeof input.approvalReason !== "string" || input.approvalReason.trim().length < 4 || input.approvalReason.length > 200))) {
    throw new Error("批次参数无效：检查门店、面额、数量、有效期及线下凭证或审批编号");
  }
  return input;
}

type CodeStatus = "unused" | "redeemed" | "revoked";
export function summarizeInventory(batch: { status: "pending" | "active" | "revoked"; expiresAt: Date }, codeStatuses: CodeStatus[], now = new Date()) {
  const summary = { allocated: codeStatuses.length, redeemed: 0, unused: 0, expired: 0, revoked: 0 };
  for (const status of codeStatuses) {
    if (status === "redeemed") summary.redeemed++;
    else if (status === "revoked" || batch.status === "revoked") summary.revoked++;
    else if (batch.expiresAt <= now) summary.expired++;
    else summary.unused++;
  }
  return summary;
}

export function createCreditCodeService(db: Database) {
  return {
    async createStore(input: { code: string; name: string }) {
      const code = input.code?.trim().toUpperCase();
      const name = input.name?.trim();
      if (!code || !/^[A-Z0-9_-]{2,50}$/.test(code) || !name || name.length > 160) throw new Error("门店编号或名称无效");
      const result = await db.insert(stores).values({ code, name });
      return { id: Number(result[0].insertId), code, name };
    },
    async listStores() { return db.select().from(stores).orderBy(stores.id); },
    async createBatch(input: BatchInput, adminId: number, now = new Date()) {
      validateBatchInput(input, now);
      return db.transaction(async tx => {
        const [store] = await tx.select({ id: stores.id, enabled: stores.enabled }).from(stores).where(eq(stores.id, input.storeId)).limit(1);
        if (!store || !store.enabled) throw new Error("门店不存在或已停用");
        const result = await tx.insert(creditCodeBatches).values({ storeId: input.storeId, amount: input.amount, quantity: input.quantity, expiresAt: input.expiresAt, purpose: input.purpose, receiptRef: input.receiptRef.trim(), status: "pending", createdBy: adminId });
        const id = Number(result[0].insertId);
        const reason = input.purpose === "promotion" ? `审批人:${input.approver!.trim()}; 原因:${input.approvalReason!.trim()}; 审批编号:${input.receiptRef.trim()}` : `线下凭证:${input.receiptRef.trim()}`;
        await tx.insert(creditCodeBatchEvents).values({ batchId: id, adminId, action: "created", quantity: input.quantity, reason });
        return { id, status: "pending" as const, codeCount: 0 };
      });
    },
    async activateBatch(batchId: number, adminId: number, now = new Date()) {
      if (!Number.isSafeInteger(batchId) || batchId <= 0) throw new Error("批次编号无效");
      return db.transaction(async tx => {
        const [batch] = await tx.select().from(creditCodeBatches).where(eq(creditCodeBatches.id, batchId)).limit(1);
        if (!batch || batch.status !== "pending") throw new Error("批次不存在或已处理");
        if (batch.expiresAt <= now) throw new Error("兑换码有效期已过");
        const changed = await tx.update(creditCodeBatches).set({ status: "active", activatedBy: adminId, activatedAt: now })
          .where(and(eq(creditCodeBatches.id, batchId), eq(creditCodeBatches.status, "pending")));
        if (changed[0].affectedRows !== 1) throw new Error("批次已被其他管理员处理");
        const rawCodes = Array.from({ length: batch.quantity }, () => createCode());
        await tx.insert(creditCodes).values(rawCodes.map(code => ({ batchId, codeHash: sha256(normalizeCode(code)), status: "unused" as const })));
        await tx.insert(creditCodeBatchEvents).values({ batchId, adminId, action: "activated", quantity: batch.quantity, reason: "线下结算或活动审批确认" });
        const csv = "\uFEFF兑换码,积分,有效期\r\n" + rawCodes.map(code => `${code},${batch.amount},${batch.expiresAt.toISOString().slice(0, 10)}`).join("\r\n") + "\r\n";
        return { batchId, codeCount: rawCodes.length, csv };
      });
    },
    async revokeBatch(batchId: number, adminId: number, reason: string, now = new Date()) {
      if (!Number.isSafeInteger(batchId) || batchId <= 0 || typeof reason !== "string" || reason.trim().length < 4 || reason.length > 500) throw new Error("批次编号或停用原因无效");
      return db.transaction(async tx => {
        const [batch] = await tx.select().from(creditCodeBatches).where(eq(creditCodeBatches.id, batchId)).limit(1);
        if (!batch || batch.status === "revoked") throw new Error("批次不存在或已停用");
        const changed = await tx.update(creditCodeBatches).set({ status: "revoked", revokedBy: adminId, revokedAt: now })
          .where(and(eq(creditCodeBatches.id, batchId), eq(creditCodeBatches.status, batch.status)));
        if (changed[0].affectedRows !== 1) throw new Error("批次已被其他管理员处理");
        const codesChanged = await tx.update(creditCodes).set({ status: "revoked" })
          .where(and(eq(creditCodes.batchId, batchId), eq(creditCodes.status, "unused")));
        await tx.insert(creditCodeBatchEvents).values({ batchId, adminId, action: "revoked", quantity: codesChanged[0].affectedRows, reason: reason.trim() });
        return { batchId, revokedCount: codesChanged[0].affectedRows };
      });
    },
    async confirmDelivery(batchId: number, adminId: number, reason: string, now = new Date()) {
      if (!Number.isSafeInteger(batchId) || batchId <= 0 || typeof reason !== "string" || reason.trim().length < 8 || reason.length > 300) throw new Error("交付确认信息无效");
      return db.transaction(async tx => {
        const [batch] = await tx.select().from(creditCodeBatches).where(eq(creditCodeBatches.id, batchId)).limit(1);
        if (!batch || batch.status !== "active") throw new Error("仅已激活批次可确认交付");
        const [existing] = await tx.select({ id: creditCodeBatchEvents.id }).from(creditCodeBatchEvents)
          .where(and(eq(creditCodeBatchEvents.batchId, batchId), eq(creditCodeBatchEvents.action, "delivery_confirmed"))).limit(1);
        if (existing) throw new Error("该批次已确认交付");
        await tx.insert(creditCodeBatchEvents).values({ batchId, adminId, action: "delivery_confirmed", quantity: batch.quantity, reason: reason.trim(), createdAt: now });
        return { batchId, confirmed: true };
      });
    },
    async listBatches(now = new Date()) {
      const batches = await db.select().from(creditCodeBatches).orderBy(desc(creditCodeBatches.createdAt)).limit(200);
      return Promise.all(batches.map(async batch => {
        const [codes, delivered] = await Promise.all([
          db.select({ status: creditCodes.status }).from(creditCodes).where(eq(creditCodes.batchId, batch.id)),
          db.select({ id: creditCodeBatchEvents.id }).from(creditCodeBatchEvents).where(and(eq(creditCodeBatchEvents.batchId, batch.id), eq(creditCodeBatchEvents.action, "delivery_confirmed"))).limit(1),
        ]);
        return { ...batch, delivered: delivered.length > 0, inventory: summarizeInventory(batch, codes.map(code => code.status), now) };
      }));
    },
    async listEvents() { return db.select().from(creditCodeBatchEvents).orderBy(desc(creditCodeBatchEvents.createdAt)).limit(200); },
  };
}

export async function getCreditCodeService() {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  return createCreditCodeService(db);
}
