import { type NextRequest, NextResponse } from "next/server";
import { userFromToken } from "@/lib/access";
import { clearSession } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

// Where pages send a dead session (deleted account, or ended by a password change) so the
// cookie is removed and /login stops redirecting back.
//
// It only clears a cookie that is really dead. A live session is left alone, so a link or
// image on another website can't log anyone out. (Sec-Fetch-Site can't be used instead:
// a redirect chain that starts on another site is "cross-site" all the way through, which
// would leave a dead cookie in place and loop between /login and /dashboard.)
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  return (await userFromToken(req.cookies.get(SESSION_COOKIE)?.value)) ? res : clearSession(res);
}
