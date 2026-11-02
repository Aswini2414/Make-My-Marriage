import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/auth/clear/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { createUser, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

const GONE = "6718f2a9c1e4b5a3d2f10a77"; // a well-formed id with no account

describe("GET /api/auth/clear", () => {
  it("clears a dead session whatever site sent the visitor here", async () => {
    // A deleted account, a garbage cookie and no cookie at all.
    for (const opts of [{ userId: GONE }, { rawCookie: "mmm_session=garbage" }, {}]) {
      const res = await GET(await request("/api/auth/clear", opts));
      expect(res.headers.get("location")).toBe("http://localhost:3000/login");
      expect(res.headers.get("set-cookie") ?? "").toContain("mmm_session=;");
    }
  });

  it("leaves a live session alone, so another website can't log anyone out", async () => {
    const user = await createUser();
    const res = await GET(await request("/api/auth/clear", { userId: String(user._id) }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie even when the session is dead or missing", async () => {
    for (const opts of [{ userId: GONE }, { rawCookie: "mmm_session=garbage" }, {}]) {
      const res = await logout(
        await request("/api/auth/logout", { method: "POST", ...opts }),
        undefined,
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("set-cookie") ?? "").toContain("mmm_session=;");
    }
  });
});
