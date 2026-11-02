import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/session";

describe("session JWT", () => {
  it("holds only the user ID and when it was issued", async () => {
    const token = await signSession("6718f2a9c1e4b5a3d2f10a77");
    expect(await verifySession(token)).toEqual({
      userId: "6718f2a9c1e4b5a3d2f10a77",
      issuedAt: expect.any(Number),
    });
  });

  it("rejects missing, tampered and wrongly signed tokens", async () => {
    const token = await signSession("6718f2a9c1e4b5a3d2f10a77");
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();

    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("6718f2a9c1e4b5a3d2f10a77")
      .sign(new TextEncoder().encode("another-secret-that-is-also-32-characters"));
    expect(await verifySession(forged)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("6718f2a9c1e4b5a3d2f10a77")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await verifySession(expired)).toBeNull();
  });
});
