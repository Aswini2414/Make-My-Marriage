import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { proxy } from "@/proxy";

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

  it("lets a logged-in member into dashboard pages", async () => {
    const res = await visit("/money", { loggedIn: true });
    expect(res.headers.get("location")).toBeNull();
  });
});
