import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";

export type MpAuthenticatedRequest = Request & { mpUser: User };

type Code2SessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export async function exchangeWechatCode(
  code: string,
  appId: string,
  secret: string,
  request: typeof fetch = fetch,
): Promise<{ openId: string; mock: boolean }> {
  if (!appId && !secret) return { openId: "mp_mock_user", mock: true };
  if (!appId || !secret) throw new Error("WECHAT_MINI_APPID 与 WECHAT_MINI_SECRET 必须同时配置");

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await request(url);
  if (!response.ok) throw new Error(`微信 code2session 请求失败：HTTP ${response.status}`);
  const data = await response.json() as Code2SessionResponse;
  if (data.errcode || !data.openid) {
    throw new Error(`微信 code2session 失败：${data.errmsg ?? data.errcode ?? "缺少 openid"}`);
  }
  return { openId: data.openid, mock: false };
}

function secretKey(secret: string): Uint8Array {
  if (!secret) throw new Error("JWT_SECRET 未配置");
  return new TextEncoder().encode(secret);
}

export async function signMpToken(user: User, secret: string): Promise<string> {
  return new SignJWT({ userId: user.id, openId: user.openId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey(secret));
}

export function createMpAuthMiddleware(
  secret: string,
  getUserById: (id: number) => Promise<User | undefined>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if ((req as Partial<MpAuthenticatedRequest>).mpUser?.id) {
      next();
      return;
    }
    const authorization = req.header("authorization") ?? "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "请先登录" } });
      return;
    }

    try {
      const { payload } = await jwtVerify(match[1], secretKey(secret), { algorithms: ["HS256"] });
      const userId = Number(payload.userId);
      if (!Number.isInteger(userId) || userId <= 0) throw new Error("JWT userId 无效");
      const user = await getUserById(userId);
      if (!user || user.openId !== payload.openId) throw new Error("用户不存在");
      (req as MpAuthenticatedRequest).mpUser = user;
      next();
    } catch {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
    }
  };
}
