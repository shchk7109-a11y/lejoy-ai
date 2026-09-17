import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  safeEqual,
  sha256,
  totp,
  verifyPassword,
  verifyTotp,
} from "./auth-crypto";

describe("总部后台凭证", () => {
  it("使用随机盐存储密码并拒绝错误密码", async () => {
    const first = await hashPassword("足够长的总部密码 1234");
    const second = await hashPassword("足够长的总部密码 1234");
    expect(first).not.toBe(second);
    await expect(verifyPassword("足够长的总部密码 1234", first)).resolves.toBe(true);
    await expect(verifyPassword("错误密码", first)).resolves.toBe(false);
  });

  it("按 RFC 6238 生成 30 秒六位动态码", () => {
    const secret = Buffer.from("12345678901234567890", "ascii");
    expect(totp(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "287082", 150_000)).toBe(false);
    expect(verifyTotp(secret, "28x082", 59_000)).toBe(false);
  });

  it("加密动态码种子且篡改密文无法解开", () => {
    const key = Buffer.alloc(32, 7);
    const secret = Buffer.from("only-for-test-secret");
    const ciphertext = encryptSecret(secret, key);
    expect(ciphertext).not.toContain(secret.toString());
    expect(decryptSecret(ciphertext, key)).toEqual(secret);
    const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith("A") ? "B" : "A") + ciphertext.slice(-1);
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("提供固定长度摘要和安全比较", () => {
    expect(sha256("abc")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
