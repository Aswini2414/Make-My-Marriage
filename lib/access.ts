import "server-only";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/errors";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Access checks used at the top of every logged-in route handler.
// See "Authentication and access control" in docs/system-design.md.

export type Role = "admin" | "manager";

export type SessionUser = { id: string; name: string; email: string };
export type ActiveMembership = { id: string; weddingId: string; userId: string; role: Role };

/** Verifies the session cookie, or answers 401 NOT_AUTHENTICATED. */
export async function requireSession(req: NextRequest): Promise<{ userId: string }> {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw new ApiError("NOT_AUTHENTICATED");
  return session;
}

/** "User" access: a logged-in account, with or without a wedding. */
export async function requireUser(req: NextRequest): Promise<{ user: SessionUser }> {
  const { userId } = await requireSession(req);
  // Phase 1: load the user from `users`; a deleted account answers 401.
  void userId;
  throw new Error("requireUser is implemented in Phase 1");
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
  // Phase 1: load the active membership fresh from `memberships` and check `role`.
  void user;
  void role;
  throw new Error("requireMember is implemented in Phase 1");
}
