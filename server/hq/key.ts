import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export const HQ_TOTP_KEY_FILE = process.env.HQ_TOTP_KEY_FILE ?? "/root/.lejoy-ai/hq-totp.key";

export function readHqTotpKey(filePath = HQ_TOTP_KEY_FILE): Buffer {
  if (!path.isAbsolute(filePath)) throw new Error("总部 TOTP 密钥路径必须为绝对路径");
  const stat = statSync(filePath);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid?.() === 0 && stat.uid !== 0)) {
    throw new Error("总部 TOTP 密钥文件权限不安全");
  }
  const key = readFileSync(filePath);
  if (key.length !== 32) throw new Error("总部 TOTP 密钥文件长度无效");
  return key;
}
