import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, generateToken, hashToken } from "@/lib/tokens";

describe("tokens", () => {
  it("generates 32-byte URL-safe tokens", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it("hashes to 64 hex characters, the same every time", () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("round-trips through encryption with a fresh IV each time", () => {
    const token = generateToken();
    const a = encryptToken(token);
    expect(a).not.toContain(token);
    expect(encryptToken(token)).not.toBe(a);
    expect(decryptToken(a)).toBe(token);
  });

  it("refuses a tampered ciphertext", () => {
    const encrypted = Buffer.from(encryptToken(generateToken()), "base64url");
    encrypted[encrypted.length - 1]! ^= 1;
    expect(() => decryptToken(encrypted.toString("base64url"))).toThrow();
  });
});
