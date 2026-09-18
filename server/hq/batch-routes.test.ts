import express from "express";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "./auth-crypto";
import { createHqBatchRouter } from "./batch-routes";

let server: ReturnType<typeof createServer>; let base: string;
let service: Record<string, ReturnType<typeof vi.fn>>;
let storeSync: Record<string, ReturnType<typeof vi.fn>>;
let mustChangePassword = 0;
const token = "a".repeat(64); const csrf = "b".repeat(48);
const cookie = `__Host-hq_session=${token}; __Host-hq_csrf=${csrf}`;
const origin = "https://api.hxzhineng.xyz";
async function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return fetch(base + "/api/hq" + path, { method, headers: { cookie, origin, "x-csrf-token": csrf, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(async () => {
  mustChangePassword = 0;
  service = {
    createStore: vi.fn(async () => ({ id: 1, code: "STORE1", name: "测试店" })),
    listStores: vi.fn(async () => []),
    createBatch: vi.fn(async () => ({ id: 7, status: "pending", codeCount: 0 })),
    activateBatch: vi.fn(async () => ({ batchId: 7, codeCount: 1, csv: "兑换码,积分\r\nABCD-EFGH-JKLM,20\r\n" })),
    confirmDelivery: vi.fn(async () => ({ batchId: 7, confirmed: true })),
    revokeBatch: vi.fn(async () => ({ batchId: 7, revokedCount: 1 })),
    listBatches: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
  };
  storeSync = {
    fetchCatalog: vi.fn(async () => [{ formatId: "community", formatName: "社区店", storeId: "nanjing", storeName: "南京店" }]),
    sync: vi.fn(async () => ({ insertedCount: 1, updatedCount: 0, disabledCount: 0, syncedAt: "2026-09-18T00:00:00.000Z", changedStores: [{ name: "南京店", change: "added" }] })),
    lastSuccess: vi.fn(async () => null),
    recordFailure: vi.fn(async () => {}),
  };
  const store = { findActiveSession: vi.fn(async (hash: string) => hash === sha256(token) ? { adminId: 3, account: { id: 3, disabled: 0, mustChangePassword } } : null) };
  const app = express(); app.use(express.json());
  app.use("/api/hq", createHqBatchRouter({ authStore: store as never, service: service as never, storeSync: storeSync as never, expectedOrigin: origin } as never));
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("HQ batch API", () => {
  it("rejects old H5 identity, missing CSRF and initial-password sessions", async () => {
    expect((await request("/batches", "GET", undefined, { cookie: "legacy_session=x" })).status).toBe(401);
    expect((await request("/batches", "POST", { storeId: 1 }, { "x-csrf-token": "" })).status).toBe(403);
    mustChangePassword = 1;
    expect((await request("/batches")).status).toBe(403);
    expect((await request("/batches/7/activate", "POST", {})).status).toBe(403);
    expect((await request("/stores/sync", "POST", {})).status).toBe(403);
    expect(service.createBatch).not.toHaveBeenCalled();
    expect((await request("/stores/sync", "POST", {}, { cookie: "legacy_session=x" })).status).toBe(401);
    expect((await request("/stores/sync", "POST", {}, { "x-csrf-token": "" })).status).toBe(403);
    expect(storeSync.fetchCatalog).not.toHaveBeenCalled();
  });

  it("只在总部管理员点击同步时读取来源，不允许再手工建立门店", async () => {
    const listed = await request("/stores");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ stores: [], lastSync: null });
    expect(storeSync.fetchCatalog).not.toHaveBeenCalled();
    expect((await request("/stores", "POST", { code: "FAKE", name: "假门店" })).status).toBe(405);
    expect(service.createStore).not.toHaveBeenCalled();
    const synced = await request("/stores/sync", "POST", {});
    expect(synced.status).toBe(200);
    expect(await synced.json()).toMatchObject({ insertedCount: 1, updatedCount: 0, disabledCount: 0, changedStores: [{ name: "南京店", change: "added" }] });
    expect(storeSync.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(storeSync.sync).toHaveBeenCalledWith(expect.any(Array), 3);
  });

  it("同步失败不改本地目录，同步中的第二次点击返回冲突", async () => {
    storeSync.fetchCatalog.mockRejectedValueOnce(new Error("remote secret must not leak"));
    const failed = await request("/stores/sync", "POST", {});
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("remote secret");
    expect(storeSync.sync).not.toHaveBeenCalled();
    expect(storeSync.recordFailure).toHaveBeenCalledWith(3, expect.any(String));

    let release: ((value: unknown) => void) | undefined;
    storeSync.fetchCatalog.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = request("/stores/sync", "POST", {});
    await vi.waitFor(() => expect(storeSync.fetchCatalog).toHaveBeenCalledTimes(2));
    expect((await request("/stores/sync", "POST", {})).status).toBe(409);
    release!([{ formatId: "community", formatName: "社区店", storeId: "nanjing", storeName: "南京店" }]);
    expect((await first).status).toBe(200);
  });
  it("creates pending batches and exports raw codes only in one activation response", async () => {
    const create = await request("/batches", "POST", { storeId: 1, amount: 20, quantity: 1, expiresAt: "2027-01-01", purpose: "purchase", receiptRef: "OFFLINE-1" });
    expect(create.status).toBe(201);
    expect(await create.json()).toEqual({ id: 7, status: "pending", codeCount: 0 });
    const activated = await request("/batches/7/activate", "POST", {});
    expect(activated.status).toBe(200);
    expect(activated.headers.get("cache-control")).toBe("no-store");
    expect(activated.headers.get("content-type")).toContain("text/csv");
    expect(await activated.text()).toContain("ABCD-EFGH-JKLM");
    expect(await (await request("/batches")).text()).not.toContain("ABCD-EFGH-JKLM");
    const delivery = await request("/batches/7/confirm-delivery", "POST", { reason: "已通过受控渠道交付店长" });
    expect(delivery.status).toBe(200);
    expect(service.confirmDelivery).toHaveBeenCalledWith(7, 3, "已通过受控渠道交付店长");
  });
  it("允许总部按具名非门店对象建待确认赠码，拒绝批量或伪造门店", async () => {
    const input = { targetKind: "trial", storeId: null, recipientLabel: "受邀体验员甲", amount: 20, quantity: 1, expiresAt: "2027-01-01", purpose: "promotion", receiptRef: "APP-123", approver: "总部负责人", approvalReason: "体验版功能验证" };
    expect((await request("/batches", "POST", input)).status).toBe(201);
    expect(service.createBatch).toHaveBeenCalledWith(expect.objectContaining({ targetKind: "trial", storeId: null, recipientLabel: "受邀体验员甲" }), 3);
    expect((await request("/batches", "POST", { ...input, quantity: 2 })).status).toBe(400);
    expect((await request("/batches", "POST", { ...input, storeId: 1 })).status).toBe(400);
    expect(service.createBatch).toHaveBeenCalledTimes(1);
  });
});
