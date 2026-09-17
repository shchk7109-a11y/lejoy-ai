import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { hqAdminAccounts, hqAdminSessions } from "../../drizzle/schema";
import { getDb } from "../db";

type Database = ReturnType<typeof drizzle>;
const IDLE_MS = 30 * 60_000;
export const HQ_SESSION_MS = 8 * 60 * 60_000;

export function createHqAuthStore(db: Database) {
  return {
    async findAccount(username: string) {
      const [account] = await db.select().from(hqAdminAccounts).where(eq(hqAdminAccounts.username, username)).limit(1);
      return account ?? null;
    },
    async findAccountById(id: number) {
      const [account] = await db.select().from(hqAdminAccounts).where(eq(hqAdminAccounts.id, id)).limit(1);
      return account ?? null;
    },
    async findActiveSession(tokenHash: string, now: Date) {
      const [row] = await db.select({ session: hqAdminSessions, account: hqAdminAccounts })
        .from(hqAdminSessions)
        .innerJoin(hqAdminAccounts, eq(hqAdminSessions.adminId, hqAdminAccounts.id))
        .where(eq(hqAdminSessions.tokenHash, tokenHash)).limit(1);
      if (!row) return null;
      const { session, account } = row;
      if (session.revokedAt || account.disabled || session.expiresAt <= now ||
          session.lastUsedAt.getTime() + IDLE_MS <= now.getTime()) return null;
      await db.update(hqAdminSessions).set({ lastUsedAt: now }).where(eq(hqAdminSessions.id, session.id));
      return { ...session, account };
    },
    async createSession(adminId: number, tokenHash: string, now: Date) {
      await db.insert(hqAdminSessions).values({ adminId, tokenHash, createdAt: now, lastUsedAt: now, expiresAt: new Date(now.getTime() + HQ_SESSION_MS) });
    },
    async revokeToken(tokenHash: string) {
      await db.update(hqAdminSessions).set({ revokedAt: new Date() }).where(eq(hqAdminSessions.tokenHash, tokenHash));
    },
    async revokeSessions(accountId: number) {
      await db.update(hqAdminSessions).set({ revokedAt: new Date() }).where(eq(hqAdminSessions.adminId, accountId));
    },
    async createAccount(input: { username: string; passwordHash: string; totpSecretEncrypted: string; mustChangePassword: true }): Promise<number> {
      const result = await db.insert(hqAdminAccounts).values({
        username: input.username, passwordHash: input.passwordHash,
        totpSecretEncrypted: input.totpSecretEncrypted, mustChangePassword: 1,
      });
      return Number(result[0].insertId);
    },
    async changePassword(accountId: number, passwordHash: string) {
      await db.update(hqAdminAccounts).set({ passwordHash, mustChangePassword: 0 }).where(eq(hqAdminAccounts.id, accountId));
    },
    async rotateTotp(accountId: number, totpSecretEncrypted: string) {
      await db.transaction(async tx => {
        await tx.update(hqAdminAccounts).set({ totpSecretEncrypted }).where(eq(hqAdminAccounts.id, accountId));
        await tx.update(hqAdminSessions).set({ revokedAt: new Date() }).where(eq(hqAdminSessions.adminId, accountId));
      });
    },
  };
}

async function requiredStore() {
  const db = await getDb();
  if (!db) throw new Error("总部后台数据库不可用");
  return createHqAuthStore(db);
}

export async function findActiveSession(tokenHash: string, now: Date) {
  return (await requiredStore()).findActiveSession(tokenHash, now);
}
export async function revokeSessions(accountId: number) {
  return (await requiredStore()).revokeSessions(accountId);
}
export async function createAccount(input: { username: string; passwordHash: string; totpSecretEncrypted: string; mustChangePassword: true }) {
  return (await requiredStore()).createAccount(input);
}
export { requiredStore as getHqAuthStore };
