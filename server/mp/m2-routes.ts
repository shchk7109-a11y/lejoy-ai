import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { InsertMediaCheckTask, MediaCheckTask } from "../../drizzle/schema";
import { aiASR, aiEditImage } from "../ai/gateway";
import { ENV } from "../_core/env";
import { withCreditCharge } from "../credits-charge";
import { ART_STYLES, buildRestorePrompt, getArtStylePrompt, type ArtStyle } from "../silverlens";
import { storageDelete, storagePut } from "../storage";
import { createMediaCheckTask, findMediaCheckTask, updateMediaCheckTaskStatus } from "./media-check-tasks";
import { checkMediaSecurity, type MediaSecuritySubmission } from "./security";
import type { MpAuthenticatedRequest } from "./auth";
import { resolveWechatMediaStatus, verifyWechatSignature, type MediaCheckStatus } from "./wechat-callback";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type StoredFile = { key: string; url: string };

export type M2Dependencies = {
  contentSecurityMode: string;
  callbackToken: string;
  storagePut: typeof storagePut;
  storageDelete: typeof storageDelete;
  submitMediaCheck: (url: string, openId?: string) => Promise<MediaSecuritySubmission>;
  createMediaCheckTask: (task: InsertMediaCheckTask) => Promise<void>;
  findMediaCheckTask: (traceId: string) => Promise<MediaCheckTask | undefined>;
  updateMediaCheckTaskStatus: (traceId: string, status: MediaCheckStatus) => Promise<void>;
  aiEditImage: typeof aiEditImage;
  aiASR: typeof aiASR;
  withCreditCharge: typeof withCreditCharge;
  createFileId: () => string;
};

export function defaultM2Dependencies(): M2Dependencies {
  return {
    contentSecurityMode: ENV.contentSecurity,
    callbackToken: ENV.wechatMpCallbackToken,
    storagePut,
    storageDelete,
    submitMediaCheck: checkMediaSecurity,
    createMediaCheckTask,
    findMediaCheckTask,
    updateMediaCheckTaskStatus,
    aiEditImage,
    aiASR,
    withCreditCharge,
    createFileId: randomUUID,
  };
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => void handler(req, res, next).catch(next);
}

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: "BAD_REQUEST", message } });
}

function decodeImage(body: unknown): { buffer: Buffer; mimeType: keyof typeof IMAGE_MIME_EXTENSIONS } {
  if (!body || typeof body !== "object") throw new Error("图片参数不能为空");
  const input = body as { base64?: unknown; mimeType?: unknown };
  if (typeof input.base64 !== "string" || !input.base64) throw new Error("base64 图片不能为空");
  if (typeof input.mimeType !== "string" || !(input.mimeType in IMAGE_MIME_EXTENSIONS)) {
    throw new Error("仅支持 jpg、png、webp 图片");
  }
  const mimeType = input.mimeType as keyof typeof IMAGE_MIME_EXTENSIONS;
  const dataUrlMatch = input.base64.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (dataUrlMatch && dataUrlMatch[1] !== mimeType) throw new Error("图片 MIME 与数据内容不一致");
  const encoded = dataUrlMatch?.[2] ?? input.base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error("base64 图片格式无效");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("图片内容不能为空");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("图片不能超过 10MB");
  return { buffer, mimeType };
}

function decodeAudio(body: unknown): { buffer: Buffer; mimeType: "audio/mpeg" } {
  if (!body || typeof body !== "object") throw new Error("录音参数不能为空");
  const input = body as { base64?: unknown; mimeType?: unknown };
  if (typeof input.base64 !== "string" || !input.base64) throw new Error("base64 录音不能为空");
  if (input.mimeType !== "audio/mpeg" && input.mimeType !== "audio/mp3") throw new Error("仅支持 mp3 录音");
  const dataUrlMatch = input.base64.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (dataUrlMatch && dataUrlMatch[1] !== input.mimeType) throw new Error("录音 MIME 与数据内容不一致");
  const encoded = dataUrlMatch?.[2] ?? input.base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new Error("base64 录音格式无效");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("录音内容不能为空");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("录音不能超过 10MB");
  return { buffer, mimeType: "audio/mpeg" };
}

function imageUrl(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as { imageUrl?: unknown }).imageUrl;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createM2Router(deps: M2Dependencies, authenticate: RequestHandler): Router {
  const router = Router();

  const submitStoredImage = async (file: StoredFile, user: { id: number; openId: string }) => {
    if (deps.contentSecurityMode !== "wechat") return "bypassed" as const;
    const submission = await deps.submitMediaCheck(file.url, user.openId);
    if (submission.status !== "pending") return submission.status;
    await deps.createMediaCheckTask({
      traceId: submission.traceId,
      userId: user.id,
      fileKey: file.key,
      status: "pending",
    });
    return submission.status;
  };

  router.get("/security/wechat-callback", (req, res) => {
    if (deps.contentSecurityMode !== "wechat") {
      res.status(204).end();
      return;
    }
    if (!deps.callbackToken) {
      res.status(503).json({ code: "NOT_CONFIGURED", message: "微信回调 Token 尚未配置" });
      return;
    }
    const timestamp = queryString(req.query.timestamp);
    const nonce = queryString(req.query.nonce);
    const signature = queryString(req.query.signature);
    const echostr = queryString(req.query.echostr);
    if (!verifyWechatSignature(deps.callbackToken, timestamp, nonce, signature)) {
      res.status(403).send("invalid signature");
      return;
    }
    res.type("text/plain").send(echostr);
  });

  router.post("/security/wechat-callback", asyncRoute(async (req, res) => {
    if (deps.contentSecurityMode !== "wechat") {
      res.status(204).end();
      return;
    }
    const timestamp = queryString(req.query.timestamp);
    const nonce = queryString(req.query.nonce);
    const signature = queryString(req.query.signature);
    if (!verifyWechatSignature(deps.callbackToken, timestamp, nonce, signature)) {
      res.status(403).send("invalid signature");
      return;
    }
    const body = req.body as { trace_id?: unknown; traceId?: unknown } | undefined;
    const traceId = queryString(body?.trace_id ?? body?.traceId);
    const status = resolveWechatMediaStatus(body);
    if (!traceId || !status) {
      badRequest(res, "媒体安全回调缺少 trace_id 或有效结论");
      return;
    }
    const task = await deps.findMediaCheckTask(traceId);
    if (task) {
      if (status === "risky") await deps.storageDelete(task.fileKey);
      await deps.updateMediaCheckTaskStatus(traceId, status);
    }
    res.type("text/plain").send("success");
  }));

  router.use(authenticate);

  router.post("/upload/image", asyncRoute(async (req, res) => {
    let decoded: ReturnType<typeof decodeImage>;
    try {
      decoded = decodeImage(req.body);
    } catch (error) {
      badRequest(res, error instanceof Error ? error.message : "图片参数错误");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const extension = IMAGE_MIME_EXTENSIONS[decoded.mimeType];
    const file = await deps.storagePut(
      `uploads/${user.id}/${deps.createFileId()}.${extension}`,
      decoded.buffer,
      decoded.mimeType,
    );
    const securityStatus = await submitStoredImage(file, user);
    res.json({ url: file.url, fileKey: file.key, securityStatus });
  }));

  router.post("/upload/audio", asyncRoute(async (req, res) => {
    let decoded: ReturnType<typeof decodeAudio>;
    try {
      decoded = decodeAudio(req.body);
    } catch (error) {
      badRequest(res, error instanceof Error ? error.message : "录音参数错误");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const file = await deps.storagePut(`voice/${user.id}/${deps.createFileId()}.mp3`, decoded.buffer, decoded.mimeType);
    res.json({ url: file.url, fileKey: file.key });
  }));

  router.post("/silverlens/restore", asyncRoute(async (req, res) => {
    const sourceUrl = imageUrl(req.body);
    if (!sourceUrl) {
      badRequest(res, "imageUrl 不能为空");
      return;
    }
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : undefined;
    const user = (req as MpAuthenticatedRequest).mpUser;
    const charged = await deps.withCreditCharge(
      user.id,
      2,
      "photo_restore",
      async () => {
        const base64 = await deps.aiEditImage({ imageUrl: sourceUrl, prompt: buildRestorePrompt(prompt) });
        const file = await deps.storagePut(`results/${user.id}/${deps.createFileId()}.png`, Buffer.from(base64, "base64"), "image/png");
        const securityStatus = await submitStoredImage(file, user);
        return { file, securityStatus };
      },
      "照片修复",
    );
    res.json({ imageUrl: charged.value.file.url, fileKey: charged.value.file.key, securityStatus: charged.value.securityStatus, credits: charged.credits });
  }));

  router.post("/silverlens/transform", asyncRoute(async (req, res) => {
    const sourceUrl = imageUrl(req.body);
    const style = req.body?.style;
    if (!sourceUrl || typeof style !== "string" || !(style in ART_STYLES)) {
      badRequest(res, "请选择有效的艺术风格");
      return;
    }
    const artStyle = style as ArtStyle;
    const user = (req as MpAuthenticatedRequest).mpUser;
    const charged = await deps.withCreditCharge(
      user.id,
      2,
      "art_transform",
      async () => {
        const base64 = await deps.aiEditImage({ imageUrl: sourceUrl, prompt: getArtStylePrompt(artStyle) });
        const file = await deps.storagePut(`results/${user.id}/${deps.createFileId()}.png`, Buffer.from(base64, "base64"), "image/png");
        const securityStatus = await submitStoredImage(file, user);
        return { file, securityStatus };
      },
      `艺术风格：${artStyle}`,
    );
    res.json({ imageUrl: charged.value.file.url, fileKey: charged.value.file.key, securityStatus: charged.value.securityStatus, credits: charged.credits });
  }));

  router.post("/stt/transcribe", asyncRoute(async (req, res) => {
    const audioUrl = typeof req.body?.audioUrl === "string" ? req.body.audioUrl.trim() : "";
    const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "zh";
    if (!audioUrl) {
      badRequest(res, "audioUrl 不能为空");
      return;
    }
    const result = await deps.aiASR(audioUrl, language);
    res.json({ text: result.text });
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[MP M2 REST]", error);
    if (error instanceof Error && error.message.includes("积分不足")) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: error.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" } });
  });

  return router;
}
