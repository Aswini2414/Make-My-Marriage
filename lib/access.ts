import "server-only";
import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { User } from "@/modules/auth/model";
import { Membership } from "@/modules/members/model";

// Access checks used at the top of every logged-in route handler.
// See "Authentication and access control" in docs/system-design.md.

export type Role = "admin" | "manager";

export type SessionUser = { id: string; name: string; email: string };
export type ActiveMembership = { id: string; weddingId: string; userId: string; role: Role };

/**
 * The account a session token belongs to, or null when the token is missing or bad, the
 * account is gone, or a password change ended the session. Pages and routes both use it.
 */
export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  const session = await verifySession(token);
  if (!session) return null;
  await connectDb();
  const user = await User.findById(session.userId).select("name email passwordChangedAt").lean();
  if (!user) return null;
  // A password reset or change ends every session issued before it. Token times are whole
  // seconds, so compare in seconds: the new session made at that moment stays valid.
  if (
    user.passwordChangedAt &&
    session.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    return null;
  }
  return { id: String(user._id), name: user.name, email: user.email };
}

/** "User" access: a logged-in account, with or without a wedding. */
export async function requireUser(req: NextRequest): Promise<{ user: SessionUser }> {
  const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  // A deleted account answers 401, like an expired session.
  if (!user) throw new ApiError("NOT_AUTHENTICATED");
  return { user };
}

/**
 * "Member" access (or "Admin" with role "admin"):
 * 1. verify the JWT, or 401; 2. load the active membership, or 403 NO_WORKSPACE;
 * 3. check the role, or 403 FORBIDDEN.
 * Every query after this filters by membership.weddingId.
 */
export async function requireMember(
  req: NextRequest,
  role?: Role,
): Promise<{ user: SessionUser; membership: ActiveMembership }> {
  const { user } = await requireUser(req);
  // Looked up fresh on every request, so a removed member loses access immediately.
  const found = await Membership.findOne({ userId: user.id, status: "active" })
    .select("weddingId userId role")
    .lean();
  if (!found) throw new ApiError("NO_WORKSPACE");
  if (role && found.role !== role) throw new ApiError("FORBIDDEN");
  return {
    user,
    membership: {
      id: String(found._id),
      weddingId: String(found.weddingId),
      userId: String(found.userId),
      role: found.role,
    },
  };
}
