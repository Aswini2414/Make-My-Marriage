import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic check only: anyone without a valid session is sent to /login.
// Real access control (active membership, role) happens in every route handler.

// Account pages that make no sense once logged in. reset-password and accept-invite are
// not listed, because someone with a session can still open an emailed link.
const GUEST_ONLY = new Set(["/login", "/signup", "/forgot-password"]);

export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // The landing page is for visitors. Anyone logged in goes straight to the dashboard.
  if (GUEST_ONLY.has(req.nextUrl.pathname)) {
    return session ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }

  if (req.nextUrl.pathname === "/") {
    return session ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }

  if (session) return NextResponse.next();

  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

// The landing page, the pages for visitors only, then the pages inside app/(dashboard)/. The route group doesn't
// appear in the URL, so each section is listed.
export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/onboarding",
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
    "/settings/:path*",
  ],
};
