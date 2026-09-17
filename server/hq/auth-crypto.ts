import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as callbackScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(callbackScrypt);

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, saltHex, keyHex] = encoded.split(":");
  if (version !== "scrypt" || !/^[a-f0-9]{64}$/.test(saltHex ?? "") || !/^[a-f0-9]{128}$/.test(keyHex ?? "")) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(keyHex, "hex"));
}

export function totp(secret: Buffer, epochMs: number): string {
  const counter = BigInt(Math.floor(epochMs / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, "0");
}

export function verifyTotp(secret: Buffer, code: string, epochMs: number): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-30_000, 0, 30_000].some((skew) => safeEqual(totp(secret, epochMs + skew), code));
}

export function encryptSecret(secret: Buffer, key: Buffer): string {
  if (key.length !== 32) throw new Error("总部加密密钥必须为 32 字节");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `v1:${iv.toString("base64")}:${encrypted.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
}

export function decryptSecret(ciphertext: string, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error("总部加密密钥必须为 32 字节");
  const [version, ivEncoded, dataEncoded, tagEncoded] = ciphertext.split(":");
  if (version !== "v1" || !ivEncoded || !dataEncoded || !tagEncoded) throw new Error("总部密文格式无效");
  const iv = Buffer.from(ivEncoded, "base64");
  const tag = Buffer.from(tagEncoded, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("总部密文长度无效");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(dataEncoded, "base64")), decipher.final()]);
}
