const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageMimeType = keyof typeof IMAGE_MIME_EXTENSIONS;

export function decodeImageUpload(body: unknown): {
  buffer: Buffer;
  mimeType: ImageMimeType;
  extension: (typeof IMAGE_MIME_EXTENSIONS)[ImageMimeType];
} {
  if (!body || typeof body !== "object") throw new Error("图片参数不能为空");
  const input = body as { base64?: unknown; mimeType?: unknown };
  if (typeof input.base64 !== "string" || !input.base64) throw new Error("base64 图片不能为空");
  if (typeof input.mimeType !== "string" || !(input.mimeType in IMAGE_MIME_EXTENSIONS)) {
    throw new Error("仅支持 jpg、png、webp 图片");
  }
  const mimeType = input.mimeType as ImageMimeType;
  const dataUrlMatch = input.base64.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (dataUrlMatch && dataUrlMatch[1] !== mimeType) throw new Error("图片 MIME 与数据内容不一致");
  const encoded = dataUrlMatch?.[2] ?? input.base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error("base64 图片格式无效");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("图片内容不能为空");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("图片不能超过 10MB");
  const signatureMatches = mimeType === "image/jpeg"
    ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : mimeType === "image/png"
      ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!signatureMatches) throw new Error("图片内容与 MIME 类型不匹配");
  return { buffer, mimeType, extension: IMAGE_MIME_EXTENSIONS[mimeType] };
}
