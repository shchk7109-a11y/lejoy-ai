import { Router, type NextFunction, type Request, type Response } from "express";
import type { InsertUser, User } from "../../drizzle/schema";
import {
  getUserById,
  getUserByOpenId,
  getUserTransactions,
  recordRegisterBonus,
  upsertUser,
} from "../db";
import { withCreditCharge } from "../credits-charge";
import { copywriterInputSchema, generateCopywriterWishes, type CopywriterInput } from "../copywriter";
import { ENV } from "../_core/env";
import { createMpAuthMiddleware, exchangeWechatCode, signMpToken, type MpAuthenticatedRequest } from "./auth";
import { MP_MODULES } from "./modules";
import { checkTextSecurity, type SecurityCheckResult } from "./security";
import { createTextSecurityBatches } from "./text-security-batches";
import { createM2Router, defaultM2Dependencies } from "./m2-routes";

type Transaction = Awaited<ReturnType<typeof getUserTransactions>>[number];

export type MpDependencies = {
  jwtSecret: string;
  wechatAppId: string;
  wechatSecret: string;
  isProduction: boolean;
  allowMockLogin: boolean;
  warn: (message: string) => void;
  exchangeWechatCode: (code: string, appId: string, secret: string) => Promise<{ openId: string; mock: boolean }>;
  upsertUser: (user: InsertUser) => Promise<void>;
  recordRegisterBonus: (userId: number, credits: number) => Promise<void>;
  getUserByOpenId: (openId: string) => Promise<User | undefined>;
  getUserById: (id: number) => Promise<User | undefined>;
  getUserTransactions: (userId: number) => Promise<Transaction[]>;
  withCreditCharge: typeof withCreditCharge;
  generateWishes: (input: CopywriterInput) => Promise<string[]>;
  checkTextSecurity: (text: string, openId?: string) => Promise<SecurityCheckResult>;
};

function defaultDependencies(): MpDependencies {
  return {
    jwtSecret: ENV.cookieSecret,
    wechatAppId: ENV.wechatMiniAppId,
    wechatSecret: ENV.wechatMiniSecret,
    isProduction: ENV.isProduction,
    allowMockLogin: ENV.mpMockLogin,
    warn: (message) => console.warn(message),
    exchangeWechatCode,
    upsertUser,
    recordRegisterBonus,
    getUserByOpenId,
    getUserById,
    getUserTransactions,
    withCreditCharge,
    generateWishes: generateCopywriterWishes,
    checkTextSecurity,
  };
}

function userPayload(user: User) {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name ?? "乐享用户",
    role: user.role,
    credits: user.credits,
  };
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => void handler(req, res, next).catch(next);
}

function securityInput(input: CopywriterInput): string {
  return Object.values(input).filter((value): value is string => typeof value === "string" && value.length > 0).join("\n");
}

export function createMpRouter(deps: MpDependencies = defaultDependencies()): Router {
  const router = Router();
  const requireAuth = createMpAuthMiddleware(deps.jwtSecret, deps.getUserById);

  router.post("/auth/login", asyncRoute(async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!code) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "code 不能为空" } });
      return;
    }
    const hasWechatConfig = Boolean(deps.wechatAppId && deps.wechatSecret);
    const hasNoWechatConfig = !deps.wechatAppId && !deps.wechatSecret;
    if (deps.isProduction && !hasWechatConfig) {
      if (!(hasNoWechatConfig && deps.allowMockLogin)) {
        res.status(503).json({ code: "NOT_CONFIGURED", message: "微信小程序登录尚未配置" });
        return;
      }
      deps.warn("[安全告警] 生产环境已通过 MP_MOCK_LOGIN=true 显式启用 mock 登录");
    }
    const session = await deps.exchangeWechatCode(code, deps.wechatAppId, deps.wechatSecret);
    await deps.upsertUser({
      openId: session.openId,
      name: session.mock ? "乐享测试用户" : undefined,
      loginMethod: session.mock ? "wechat_mp_mock" : "wechat_mp",
      lastSignedIn: new Date(),
    });
    const user = await deps.getUserByOpenId(session.openId);
    if (!user) throw new Error("登录用户写入失败");
    await deps.recordRegisterBonus(user.id, user.credits);
    const token = await signMpToken(user, deps.jwtSecret);
    res.json({ token, user: userPayload(user), mock: session.mock });
  }));

  router.get("/user/me", requireAuth, asyncRoute(async (req, res) => {
    const current = (req as MpAuthenticatedRequest).mpUser;
    const user = await deps.getUserById(current.id);
    if (!user) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "用户不存在" } });
      return;
    }
    res.json(userPayload(user));
  }));

  router.get("/modules", requireAuth, (_req, res) => {
    res.json({ modules: MP_MODULES });
  });

  router.use(createM2Router(defaultM2Dependencies(), requireAuth));

  router.post("/copywriter/generate", requireAuth, asyncRoute(async (req, res) => {
    const parsed = copywriterInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "参数错误" } });
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    if (user.credits < 1) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: "积分不足" } });
      return;
    }

    const inputCheck = await deps.checkTextSecurity(securityInput(parsed.data), user.openId);
    if (!inputCheck.safe) {
      res.status(422).json({ error: { code: "CONTENT_REJECTED", message: inputCheck.reason ?? "输入内容未通过安全检查" } });
      return;
    }
    try {
      const { value: wishes, credits } = await deps.withCreditCharge(
        user.id,
        1,
        "wish_generate",
        async () => {
          const generated = await deps.generateWishes(parsed.data);
          for (const batch of createTextSecurityBatches(generated)) {
            const outputCheck = await deps.checkTextSecurity(batch, user.openId);
            if (!outputCheck.safe) {
              throw new ContentRejectedError(outputCheck.reason ?? "生成内容未通过安全检查");
            }
          }
          return generated;
        },
        "暖心文案",
      );
      res.json({ wishes, credits });
    } catch (error) {
      if (error instanceof ContentRejectedError) {
        res.status(422).json({ error: { code: "CONTENT_REJECTED", message: error.message } });
        return;
      }
      if (error instanceof Error && error.message.includes("积分不足")) {
        res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: error.message } });
        return;
      }
      throw error;
    }
  }));

  router.get("/credits/history", requireAuth, asyncRoute(async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const transactions = await deps.getUserTransactions(user.id);
    res.json({ transactions });
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[MP REST]", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" } });
  });

  return router;
}

class ContentRejectedError extends Error {}
