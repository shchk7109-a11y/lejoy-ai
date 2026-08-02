import { createHash, timingSafeEqual } from "node:crypto";

export type MediaCheckStatus = "pass" | "risky";

export function verifyWechatSignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
): boolean {
  if (!token || !timestamp || !nonce || !signature) return false;
  const expected = createHash("sha1")
    .update([token, timestamp, nonce].sort().join(""))
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length
    && timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function resolveWechatMediaStatus(payload: unknown): MediaCheckStatus | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as { isrisky?: unknown; result?: { suggest?: unknown } };
  const suggest = body.result?.suggest;
  if (suggest === "pass") return "pass";
  if (suggest === "risky" || suggest === "review") return "risky";
  if (body.isrisky === 0) return "pass";
  if (body.isrisky === 1) return "risky";
  return undefined;
}
