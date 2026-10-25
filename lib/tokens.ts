import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { coreEnv } from "@/lib/env";

// Link tokens for member invites, password resets, guest invitations and QR codes.
// MongoDB stores only the SHA-256 hash. Guest invitation and QR tokens also keep an
// AES-256-GCM encrypted copy so the same link can be re-sent or re-printed.

/** 32 random bytes as a URL-safe string. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 as 64 hex characters, used for lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

function key() {
  return Buffer.from(coreEnv().TOKEN_ENCRYPTION_KEY, "base64");
}

/** Encrypts as base64url(iv | authTag | ciphertext). */
export function encryptToken(token: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** Throws if the value was tampered with or encrypted with another key. */
export function decryptToken(encrypted: string): string {
  const data = Buffer.from(encrypted, "base64url");
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = data.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
