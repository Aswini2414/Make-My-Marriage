import { jwtVerify, SignJWT } from "jose";

// Session JWT helpers. Kept free of database and server-only imports so proxy.ts can use them.

export const SESSION_COOKIE = "mmm_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}

/** The JWT holds only the user ID. Role and wedding are looked up fresh on every request. */
export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/**
 * Returns the user ID and when the token was issued (seconds since 1970), or null for a
 * missing, expired or tampered token.
 */
export async function verifySession(
  token: string | undefined,
): Promise<{ userId: string; issuedAt: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    // The subject must look like a Mongo ObjectId, so nothing odd reaches a query.
    return payload.sub && payload.iat && /^[0-9a-f]{24}$/i.test(payload.sub)
      ? { userId: payload.sub, issuedAt: payload.iat }
      : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;
