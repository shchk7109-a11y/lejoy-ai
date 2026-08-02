import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const MP_API_VERSION = "1.0.0";

export type MpRequestLog = {
  userId: number | null;
  path: string;
  durationMs: number;
  errorCode: string;
};

export type MpRequestLogSink = (entry: MpRequestLog) => void;

type RequestWithOptionalUser = Request & { mpUser?: { id?: unknown } };
type IdempotentResponse = { statusCode: number; body: unknown };
type IdempotentEntry = { promise: Promise<IdempotentResponse>; expiresAt: number; requestFingerprint: string };

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{16,80}$/;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 500;

function responseErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const payload = body as { code?: unknown; error?: { code?: unknown } };
  if (typeof payload.error?.code === "string") return payload.error.code;
  return typeof payload.code === "string" ? payload.code : undefined;
}

function defaultSink(entry: MpRequestLog): void {
  console.info("[MP REQUEST]", JSON.stringify(entry));
}

export function createMpRequestLogMiddleware(sink: MpRequestLogSink = defaultSink): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    let errorCode: string | undefined;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      errorCode = responseErrorCode(body) ?? errorCode;
      return originalJson(body);
    }) as Response["json"];

    res.once("finish", () => {
      const candidate = (req as RequestWithOptionalUser).mpUser?.id;
      sink({
        userId: typeof candidate === "number" ? candidate : null,
        path: req.originalUrl.split("?")[0] || req.path,
        durationMs: Math.max(0, Date.now() - startedAt),
        errorCode: errorCode ?? (res.statusCode >= 400 ? `HTTP_${res.statusCode}` : "OK"),
      });
    });
    next();
  };
}

export function isMpTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /(?:time[ -]?out|timed out|etimedout|econnaborted|超时)/i.test(error.message);
}

export function sendMpTimeoutError(error: unknown, res: Response): boolean {
  if (!isMpTimeoutError(error)) return false;
  res.status(504).json({ error: { code: "AI_TIMEOUT", message: "AI 服务响应超时，请稍后重试" } });
  return true;
}

export function createMpIdempotencyMiddleware(): RequestHandler {
  const entries = new Map<string, IdempotentEntry>();

  function prune(now: number): void {
    entries.forEach((entry, key) => {
      if (entry.expiresAt <= now) entries.delete(key);
    });
    while (entries.size >= IDEMPOTENCY_MAX_ENTRIES) {
      const oldest = entries.keys().next().value as string | undefined;
      if (!oldest) break;
      entries.delete(oldest);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const operationId = req.header("x-idempotency-key") ?? "";
    const authorization = req.header("authorization") ?? "";
    if (req.method !== "POST" || !authorization || !IDEMPOTENCY_KEY_PATTERN.test(operationId)) {
      next();
      return;
    }

    const now = Date.now();
    prune(now);
    const requestFingerprint = createHash("sha256").update(JSON.stringify(req.body ?? null)).digest("hex");
    const cacheKey = createHash("sha256")
      .update(authorization)
      .update("\0")
      .update(req.path)
      .update("\0")
      .update(operationId)
      .digest("hex");
    const existing = entries.get(cacheKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "同一操作号的请求内容不一致" } });
        return;
      }
      void existing.promise.then((snapshot) => {
        if (!res.headersSent && !res.destroyed) res.status(snapshot.statusCode).json(snapshot.body);
      }).catch(next);
      return;
    }

    let resolveEntry!: (snapshot: IdempotentResponse) => void;
    const promise = new Promise<IdempotentResponse>((resolve) => { resolveEntry = resolve; });
    entries.set(cacheKey, { promise, expiresAt: now + IDEMPOTENCY_TTL_MS, requestFingerprint });
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const snapshot = { statusCode: res.statusCode, body };
      resolveEntry(snapshot);
      if (res.statusCode >= 500) entries.delete(cacheKey);
      return originalJson(body);
    }) as Response["json"];
    next();
  };
}
