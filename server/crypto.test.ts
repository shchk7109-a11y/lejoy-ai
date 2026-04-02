import { describe, expect, it } from "vitest";
import { encrypt, decrypt, maskApiKey } from "./crypto";

describe("crypto", () => {
  it("encrypts and decrypts a string correctly", () => {
    const original = "sk-test-api-key-12345678";
    const encrypted = encrypt(original);
    expect(encrypted).toMatch(/^enc:/);
    expect(encrypted).not.toContain(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("returns empty string as-is", () => {
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });

  it("returns non-encrypted string as-is for backward compatibility", () => {
    const plain = "sk-plain-key";
    expect(decrypt(plain)).toBe(plain);
  });

  it("masks API key correctly", () => {
    const encrypted = encrypt("sk-abcdefghijklmnop");
    const masked = maskApiKey(encrypted);
    expect(masked).toBe("sk-a****mnop");
  });

  it("masks short keys", () => {
    const encrypted = encrypt("short");
    const masked = maskApiKey(encrypted);
    expect(masked).toBe("****");
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const original = "same-key";
    const enc1 = encrypt(original);
    const enc2 = encrypt(original);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(original);
    expect(decrypt(enc2)).toBe(original);
  });
});
