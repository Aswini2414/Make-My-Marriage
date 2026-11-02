import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { userFromToken, type Role, type SessionUser } from "@/lib/access";
import { SESSION_COOKIE } from "@/lib/session";
import { connectDb } from "@/lib/db";
import { Membership } from "@/modules/members/model";
import { getWedding, type WeddingView } from "@/modules/weddings/service";

// Access checks for server-rendered pages: the same rules as lib/access.ts, ending in a
// redirect instead of an error response.

/** The logged-in account, or a redirect that also clears a dead session cookie. */
export async function pageUser(): Promise<SessionUser> {
  const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  // The cookie may look valid to proxy.ts while the account is gone or the session was
  // ended by a password change, so it has to be cleared or /login would bounce back here.
  if (!user) redirect("/api/auth/clear");
  return user;
}

/** The logged-in account if there is one, without redirecting. */
export async function maybeUser(): Promise<SessionUser | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export type PageMember = { user: SessionUser; wedding: WeddingView; role: Role };

/**
 * The account and its wedding, or null for an account that has no wedding yet. Cached for
 * the request, so a layout and its page share one lookup.
 */
export const pageMember = cache(
  async (): Promise<{ user: SessionUser; member: PageMember | null }> => {
    const user = await pageUser();
    await connectDb();
    const membership = await Membership.findOne({ userId: user.id, status: "active" })
      .select("weddingId role")
      .lean();
    if (!membership) return { user, member: null };
    const wedding = await getWedding(String(membership.weddingId));
    return { user, member: { user, wedding, role: membership.role } };
  },
);
