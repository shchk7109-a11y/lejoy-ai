import { RequestHandler, Router } from "express";
import { redeemCode, RedeemError } from "../credits/redeem";
import { MpAuthenticatedRequest } from "./auth";

type Dependencies = {
  requireAuth: RequestHandler;
  redeem: typeof redeemCode;
};
const MESSAGES = {
  INVALID_CODE: "兑换码不正确，请核对后重试",
  CODE_USED: "这张兑换码已使用，请向店长领取新码",
  CODE_EXPIRED: "这张兑换码已过期，请向店长领取新码",
  CODE_INACTIVE: "这张兑换码暂未生效或已停用，请联系店长",
} as const;

export function createCreditRedeemRouter(deps: Dependencies) {
  const router = Router();
  const attempts = new Map<string, { count: number; until: number }>();
  router.post("/credits/redeem", deps.requireAuth, async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const key = `${user.id}:${req.ip}`;
    const now = Date.now();
    const prior = attempts.get(key);
    if (prior && prior.count >= 5 && prior.until > now) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试" } }); return;
    }
    const code = req.body?.code;
    if (typeof code !== "string" || code.length > 64) {
      res.status(400).json({ error: { code: "INVALID_CODE", message: MESSAGES.INVALID_CODE } }); return;
    }
    try {
      const result = await deps.redeem(user.id, code);
      attempts.delete(key);
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      if (error instanceof RedeemError) {
        const count = prior && prior.until > now ? prior.count + 1 : 1;
        attempts.set(key, { count, until: now + 15 * 60_000 });
        const status = error.code === "CODE_USED" ? 409 : error.code === "INVALID_CODE" ? 400 : 422;
        res.status(status).json({ error: { code: error.code, message: MESSAGES[error.code] } }); return;
      }
      res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "服务暂时忙不过来，请稍后主动重试" } });
    }
  });
  return router;
}
