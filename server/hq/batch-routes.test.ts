import express from "express";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "./auth-crypto";
import { createHqBatchRouter } from "./batch-routes";

let server: ReturnType<typeof createServer>; let base: string;
let service: Record<string, ReturnType<typeof vi.fn>>;
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
  const store = { findActiveSession: vi.fn(async (hash: string) => hash === sha256(token) ? { adminId: 3, account: { id: 3, disabled: 0, mustChangePassword } } : null) };
  const app = express(); app.use(express.json());
  app.use("/api/hq", createHqBatchRouter({ authStore: store as never, service: service as never, expectedOrigin: origin }));
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
    expect(service.createBatch).not.toHaveBeenCalled();
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
});
