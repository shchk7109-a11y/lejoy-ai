import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * AES-256-GCM encryption for API keys stored in database.
 * Uses JWT_SECRET as the base key material for deriving the encryption key.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "lejoy-ai-apikey-salt"; // Static salt for deterministic key derivation

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || "default-secret-key";
  return scryptSync(secret, SALT, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string. Returns a hex-encoded string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: hex(iv) + ":" + hex(encrypted) + ":" + hex(tag)
  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/**
 * Decrypt a previously encrypted string. Returns the original plaintext.
 * If the input doesn't look encrypted (no "enc:" prefix), returns it as-is for backward compatibility.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith("enc:")) return ciphertext; // Not encrypted, return as-is
  const parts = ciphertext.slice(4).split(":");
  if (parts.length !== 3) return ciphertext;

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Mask an API key for display (show first 4 and last 4 chars).
 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  const decrypted = decrypt(key);
  if (decrypted.length <= 8) return "****";
  return decrypted.slice(0, 4) + "****" + decrypted.slice(-4);
}
