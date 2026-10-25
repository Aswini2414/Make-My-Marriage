import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic check only: anyone without a valid session is sent to /login.
// Real access control (active membership, role) happens in every route handler.

export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

// The pages inside app/(dashboard)/. The route group doesn't appear in the URL,
// so each section is listed.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/events/:path*",
    "/guests/:path*",
    "/invitations/:path*",
    "/money/:path*",
    "/vendors/:path*",
    "/tasks/:path*",
    "/website/:path*",
    "/photos/:path*",
    "/members/:path*",
  ],
};
