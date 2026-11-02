import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { config, proxy } from "@/proxy";

async function visit(path: string, { loggedIn = false } = {}) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  if (loggedIn) req.cookies.set(SESSION_COOKIE, await signSession("6718f2a9c1e4b5a3d2f10a77"));
  return proxy(req);
}

describe("proxy", () => {
  it("shows the landing page to visitors", async () => {
    const res = await visit("/");
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a logged-in member from the landing page to the dashboard", async () => {
    const res = await visit("/", { loggedIn: true });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("sends visitors from a dashboard page to login, remembering where they were going", async () => {
    const res = await visit("/money?tab=gifts");
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/money?tab=gifts");
  });

  it("shows login, signup and forgot-password to visitors, and sends logged-in people to the dashboard", async () => {
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      expect((await visit(path)).headers.get("location"), path).toBeNull();
      const res = await visit(path, { loggedIn: true });
      expect(res.headers.get("location"), path).toBe("http://localhost:3000/dashboard");
    }
  });

  it("lets a logged-in person open an emailed reset link", async () => {
    // reset-password isn't in the matcher at all, so it never redirects.
    expect(config.matcher).not.toContain("/reset-password");
    expect(config.matcher).toEqual(
      expect.arrayContaining(["/login", "/signup", "/forgot-password"]),
    );
  });

  it("sends visitors from /onboarding to login, and lets a logged-in account in", async () => {
    expect(config.matcher).toContain("/onboarding");
    const out = await visit("/onboarding");
    expect(new URL(out.headers.get("location")!).searchParams.get("next")).toBe("/onboarding");
    expect((await visit("/onboarding", { loggedIn: true })).headers.get("location")).toBeNull();
  });

  it("lets a logged-in member into dashboard pages", async () => {
    const res = await visit("/money", { loggedIn: true });
    expect(res.headers.get("location")).toBeNull();
  });
});
