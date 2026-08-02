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
