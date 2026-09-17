import express from "express";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret, hashPassword, totp } from "./auth-crypto";
import { createHqAuthRouter } from "./auth-routes";

const origin = "https://api.hxzhineng.xyz";
const key = Buffer.alloc(32, 7);
const secret = Buffer.from("12345678901234567890");
const at = new Date("2026-09-17T12:00:00.000Z");
let server: ReturnType<typeof createServer>;
let base = "";
let store: ReturnType<typeof fakeStore>;

function fakeStore() {
  let tokenHash = "";
  let active = true;
  let mustChangePassword = 1;
  let passwordHash = "";
  const account = { id: 1, username: "hq", disabled: 0, get passwordHash() { return passwordHash; }, totpSecretEncrypted: encryptSecret(secret, key), get mustChangePassword() { return mustChangePassword; } };
  return {
    account,
    setPasswordHash: (value: string) => { passwordHash = value; },
    findAccount: vi.fn(async (username: string) => username === "hq" ? account : null),
    findAccountById: vi.fn(async () => account),
    findActiveSession: vi.fn(async (hash: string) => active && hash === tokenHash ? { id: 1, adminId: 1, account } : null),
    createSession: vi.fn(async (_id: number, hash: string) => { tokenHash = hash; active = true; }),
    revokeToken: vi.fn(async () => { active = false; }),
    changePassword: vi.fn(async (_id: number, hash: string) => { passwordHash = hash; mustChangePassword = 0; active = false; }),
  };
}

function cookieHeader(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(/, (?=__Host-)/).map(x => x.split(";")[0]).join("; ");
}
function csrf(cookie: string): string { return /__Host-hq_csrf=([^;]+)/.exec(cookie)?.[1] ?? ""; }
async function post(path: string, body: unknown, cookie = "", csrfToken = "", requestOrigin = origin, sourceIp = "") {
  return fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin: requestOrigin, cookie, "x-csrf-token": csrfToken, ...(sourceIp ? { "x-forwarded-for": sourceIp } : {}) }, body: JSON.stringify(body) });
}

beforeEach(async () => {
  store = fakeStore();
  store.setPasswordHash(await hashPassword("valid-password"));
  const app = express(); app.set("trust proxy", "loopback"); app.use(express.json());
  app.use("/api/hq", createHqAuthRouter({ store: store as never, expectedOrigin: origin, totpKey: key, now: () => at }));
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("HQ auth routes", () => {
  it("rejects no session, old H5 cookie, wrong origin and wrong credentials uniformly", async () => {
    expect((await fetch(base + "/api/hq/auth/me")).status).toBe(401);
    expect((await fetch(base + "/api/hq/auth/me", { headers: { cookie: "app_session=legacy" } })).status).toBe(401);
    const wrongUser = await post("/api/hq/auth/login", { username: "unknown", password: "x", code: "000000" });
    const wrongPassword = await post("/api/hq/auth/login", { username: "hq", password: "x", code: totp(secret, at.getTime()) });
    const wrongTotp = await post("/api/hq/auth/login", { username: "hq", password: "valid-password", code: "000000" });
    expect([wrongUser.status, wrongPassword.status, wrongTotp.status]).toEqual([401, 401, 401]);
    const bodies = await Promise.all([wrongUser, wrongPassword, wrongTotp].map(response => response.text()));
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect((await post("/api/hq/auth/login", { username: "hq", password: "valid-password", code: totp(secret, at.getTime()) }, "", "", "https://other.invalid")).status).toBe(403);
  });

  it("locks source and account after five failed attempts", async () => {
    for (let i = 0; i < 5; i++) expect((await post("/api/hq/auth/login", { username: "hq", password: "wrong", code: "000000" }, "", "", origin, "203.0.113.5")).status).toBe(401);
    expect((await post("/api/hq/auth/login", { username: "hq", password: "valid-password", code: totp(secret, at.getTime()) }, "", "", origin, "203.0.113.6")).status).toBe(429);
    expect((await post("/api/hq/auth/login", { username: "other", password: "x", code: "000000" }, "", "", origin, "203.0.113.5")).status).toBe(429);
  });

  it("requires first password change and CSRF, then revokes on logout", async () => {
    const login = await post("/api/hq/auth/login", { username: "hq", password: "valid-password", code: totp(secret, at.getTime()) });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("__Host-hq_session=");
    expect(login.headers.get("set-cookie")).toContain("Secure");
    const cookie = cookieHeader(login);
    expect((await fetch(base + "/api/hq/auth/me", { headers: { cookie } })).status).toBe(200);
    expect((await post("/api/hq/auth/password/change", { oldPassword: "valid-password", newPassword: "new-long-password" }, cookie)).status).toBe(403);
    const changed = await post("/api/hq/auth/password/change", { oldPassword: "valid-password", newPassword: "new-long-password" }, cookie, csrf(cookie));
    expect(changed.status).toBe(200);
    expect(store.changePassword).toHaveBeenCalledOnce();
    expect((await fetch(base + "/api/hq/auth/me", { headers: { cookie } })).status).toBe(401);
    const refreshedCookie = cookieHeader(changed);
    expect((await fetch(base + "/api/hq/auth/me", { headers: { cookie: refreshedCookie } })).status).toBe(200);
    expect((await post("/api/hq/auth/logout", {}, refreshedCookie, csrf(refreshedCookie))).status).toBe(200);
    expect((await fetch(base + "/api/hq/auth/me", { headers: { cookie: refreshedCookie } })).status).toBe(401);
  });
});
