import { describe, expect, it, vi } from "vitest";
import { createHqAuthStore } from "./auth-store";

function fakeDatabase(sessionRows: unknown[] = []) {
  const limit = vi.fn().mockResolvedValue(sessionRows);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ where, innerJoin }));
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  const remove = vi.fn(() => ({ where: deleteWhere }));
  const insertValues = vi.fn().mockResolvedValue([{ insertId: 8 }]);
  const insert = vi.fn(() => ({ values: insertValues }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ update }));
  return { db: { select, update, delete: remove, insert, transaction }, spies: { update, insertValues, deleteWhere, transaction, updateSet } };
}

describe("HQ authentication store", () => {
  it("rejects idle, absolutely expired, revoked and disabled sessions", async () => {
    const now = new Date("2026-09-17T12:00:00Z");
    const base = { id: 1, adminId: 2, tokenHash: "hash", createdAt: new Date("2026-09-17T11:00:00Z"), lastUsedAt: new Date("2026-09-17T11:50:00Z"), expiresAt: new Date("2026-09-17T19:00:00Z"), revokedAt: null, account: { id: 2, username: "hq", disabled: 0, mustChangePassword: 0 } };
    for (const row of [
      { ...base, lastUsedAt: new Date("2026-09-17T11:29:59Z") },
      { ...base, expiresAt: now },
      { ...base, revokedAt: now },
      { ...base, account: { ...base.account, disabled: 1 } },
    ]) {
      const { account, ...session } = row;
      const { db } = fakeDatabase([{ session, account }]);
      expect(await createHqAuthStore(db as never).findActiveSession("hash", now)).toBeNull();
    }
    const { account, ...session } = base;
    const { db, spies } = fakeDatabase([{ session, account }]);
    expect(await createHqAuthStore(db as never).findActiveSession("hash", now)).toMatchObject({ adminId: 2 });
    expect(spies.update).toHaveBeenCalledOnce();
  });

  it("creates accounts and revokes all sessions on recovery", async () => {
    const { db, spies } = fakeDatabase();
    const store = createHqAuthStore(db as never);
    await expect(store.createAccount({ username: "hq", passwordHash: "hash", totpSecretEncrypted: "cipher", mustChangePassword: true })).resolves.toBe(8);
    expect(spies.insertValues).toHaveBeenCalledWith(expect.objectContaining({ username: "hq", mustChangePassword: 1 }));
    await store.revokeSessions(8);
    expect(spies.update).toHaveBeenCalledOnce();
    await store.rotateTotp(8, "replacement-cipher");
    expect(spies.transaction).toHaveBeenCalledOnce();
    expect(spies.update).toHaveBeenCalledTimes(3);
    expect(spies.updateSet).toHaveBeenCalledWith({ totpSecretEncrypted: "replacement-cipher" });
    expect(spies.updateSet).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
  });
});
