import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader, serialize } from "cookie";
import { NextFunction, Request, Response, Router } from "express";
import { createHqAuthStore, getHqAuthStore } from "./auth-store";
import { decryptSecret, hashPassword, safeEqual, sha256, verifyPassword, verifyTotp } from "./auth-crypto";
import { readHqTotpKey } from "./key";

const SESSION_COOKIE = "__Host-hq_session";
const CSRF_COOKIE = "__Host-hq_csrf";
type Store = ReturnType<typeof createHqAuthStore>;
type Options = { store?: Store; expectedOrigin?: string; totpKey?: Buffer; now?: () => Date };

function cookies(req: Request) { return parseCookieHeader(req.headers.cookie ?? ""); }
function originFor(options: Options) { return options.expectedOrigin ?? (process.env.HQ_ORIGIN || "https://api.hxzhineng.xyz"); }
function sameOrigin(req: Request, origin: string) { return req.header("origin") === origin; }
function sendError(res: Response, status: number, code: string, message: string) { res.status(status).json({ code, message }); }
async function storeFor(options: Options) { return options.store ?? getHqAuthStore(); }

export function requireHqAdmin(options: Options = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = cookies(req)[SESSION_COOKIE];
      if (!token || !/^[a-f0-9]{64}$/.test(token)) { sendError(res, 401, "UNAUTHORIZED", "请先登录总部后台"); return; }
      const session = await (await storeFor(options)).findActiveSession(sha256(token), options.now?.() ?? new Date());
      if (!session) { sendError(res, 401, "UNAUTHORIZED", "请先登录总部后台"); return; }
      res.locals.hqAdminId = session.adminId;
      res.locals.hqMustChangePassword = Boolean(session.account.mustChangePassword);
      res.locals.hqTokenHash = sha256(token);
      next();
    } catch { sendError(res, 503, "HQ_UNAVAILABLE", "总部后台暂不可用"); }
  };
}

export function requireHqCsrf(options: Options = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookie = cookies(req)[CSRF_COOKIE];
    const header = req.header("x-csrf-token");
    if (!sameOrigin(req, originFor(options)) || !cookie || !header || !safeEqual(cookie, header)) {
      sendError(res, 403, "CSRF_REJECTED", "请求来源校验失败，请刷新页面"); return;
    }
    next();
  };
}

export function requireHqReady(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.hqMustChangePassword) { sendError(res, 403, "PASSWORD_CHANGE_REQUIRED", "请先修改初始密码"); return; }
  next();
}

export function createHqAuthRouter(options: Options = {}) {
  const router = Router();
  const attempts = new Map<string, { count: number; until: number }>();
  router.post("/auth/login", async (req, res) => {
    if (!sameOrigin(req, originFor(options))) { sendError(res, 403, "ORIGIN_REJECTED", "请求来源校验失败"); return; }
    const { username, password, code } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || typeof code !== "string" || username.length > 80 || password.length > 512) {
      sendError(res, 401, "INVALID_CREDENTIALS", "账号或验证信息不正确"); return;
    }
    const now = options.now?.() ?? new Date();
    const source = `${req.ip}:${username.toLowerCase()}`;
    const item = attempts.get(source);
    if (item && item.count >= 5 && item.until > now.getTime()) { sendError(res, 429, "RATE_LIMITED", "尝试次数过多，请稍后重试"); return; }
    try {
      const store = await storeFor(options);
      const account = await store.findAccount(username);
      const key = options.totpKey ?? readHqTotpKey();
      const valid = account && !account.disabled &&
        await verifyPassword(password, account.passwordHash) &&
        verifyTotp(decryptSecret(account.totpSecretEncrypted, key), code, now.getTime());
      if (!valid) {
        const count = item && item.until > now.getTime() ? item.count + 1 : 1;
        attempts.set(source, { count, until: now.getTime() + 15 * 60_000 });
        sendError(res, 401, "INVALID_CREDENTIALS", "账号或验证信息不正确"); return;
      }
      attempts.delete(source);
      const token = randomBytes(32).toString("hex");
      const csrf = randomBytes(24).toString("hex");
      await store.createSession(account.id, sha256(token), now);
      res.setHeader("Set-Cookie", [
        serialize(SESSION_COOKIE, token, { path: "/", secure: true, httpOnly: true, sameSite: "strict", maxAge: 8 * 60 * 60 }),
        serialize(CSRF_COOKIE, csrf, { path: "/", secure: true, httpOnly: false, sameSite: "strict", maxAge: 8 * 60 * 60 }),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json({ username: account.username, mustChangePassword: Boolean(account.mustChangePassword) });
    } catch { sendError(res, 503, "HQ_UNAVAILABLE", "总部后台暂不可用"); }
  });
  router.get("/auth/me", requireHqAdmin(options), async (_req, res) => {
    try {
      const account = await (await storeFor(options)).findAccountById(res.locals.hqAdminId);
      if (!account || account.disabled) { sendError(res, 401, "UNAUTHORIZED", "请先登录总部后台"); return; }
      res.setHeader("Cache-Control", "no-store");
      res.json({ username: account.username, mustChangePassword: Boolean(account.mustChangePassword) });
    } catch { sendError(res, 503, "HQ_UNAVAILABLE", "总部后台暂不可用"); }
  });
  router.post("/auth/password/change", requireHqAdmin(options), requireHqCsrf(options), async (req, res) => {
    const { oldPassword, newPassword } = req.body ?? {};
    if (typeof oldPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128 || oldPassword === newPassword) {
      sendError(res, 400, "BAD_PASSWORD", "新密码至少 12 位，且不能与旧密码相同"); return;
    }
    try {
      const store = await storeFor(options);
      const account = await store.findAccountById(res.locals.hqAdminId);
      if (!account || !await verifyPassword(oldPassword, account.passwordHash)) { sendError(res, 401, "INVALID_CREDENTIALS", "原密码不正确"); return; }
      await store.changePassword(account.id, await hashPassword(newPassword));
      res.json({ ok: true });
    } catch { sendError(res, 503, "HQ_UNAVAILABLE", "总部后台暂不可用"); }
  });
  router.post("/auth/logout", requireHqAdmin(options), requireHqCsrf(options), async (_req, res) => {
    try {
      await (await storeFor(options)).revokeToken(res.locals.hqTokenHash);
      res.setHeader("Set-Cookie", [
        serialize(SESSION_COOKIE, "", { path: "/", secure: true, httpOnly: true, sameSite: "strict", maxAge: 0 }),
        serialize(CSRF_COOKIE, "", { path: "/", secure: true, sameSite: "strict", maxAge: 0 }),
      ]);
      res.json({ ok: true });
    } catch { sendError(res, 503, "HQ_UNAVAILABLE", "总部后台暂不可用"); }
  });
  return router;
}
