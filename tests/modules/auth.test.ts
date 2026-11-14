import mongoose from "mongoose";
import type { NextResponse } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Replace Gmail with a spy; the daily-cap logic in lib/mailer.ts still runs for real.
const sendMailSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { generateToken, hashToken } from "@/lib/tokens";
import { PasswordReset, User } from "@/modules/auth/model";
import { Membership } from "@/modules/members/model";
import { RateLimit } from "@/lib/rate-limit";
import { createMember, createUser, emptyDb, request, resetDb, TEST_PASSWORD } from "../helpers";

beforeAll(resetDb);
beforeEach(async () => {
  await emptyDb();
  sendMailSpy.mockClear();
});
afterAll(() => mongoose.disconnect());

const ctx = undefined;
// Route handlers return NextResponse, which has the .cookies the tests read.
const call = (route: (req: never, ctx: never) => Promise<Response>, req: unknown) =>
  route(req as never, ctx as never) as Promise<NextResponse>;

async function errorOf(res: Response) {
  return (await res.json()).error as { code: string; message: string; fields?: unknown };
}

describe("POST /api/auth/signup", () => {
  it("creates the account, logs in and never returns the hash", async () => {
    const res = await call(
      signup,
      await request("/api/auth/signup", {
        method: "POST",
        body: { name: " Leela ", email: "Leela@Example.com", password: "at-least-8-chars" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      user: { id: expect.any(String), name: "Leela", email: "leela@example.com" },
      wedding: null,
    });
    expect(JSON.stringify(body)).not.toMatch(/hash/i);

    const cookie = res.cookies.get(SESSION_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(await verifySession(cookie.value)).toEqual({
      userId: body.user.id,
      issuedAt: expect.any(Number),
    });

    const stored = await User.findOne().select("+passwordHash").lean();
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("answers 409 EMAIL_TAKEN for an existing email", async () => {
    await createUser();
    const res = await call(
      signup,
      await request("/api/auth/signup", {
        method: "POST",
        body: { name: "Other", email: "LEELA@example.com", password: "at-least-8-chars" },
      }),
    );
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("EMAIL_TAKEN");
  });

  it("answers 400 with fields for bad input", async () => {
    const res = await call(
      signup,
      await request("/api/auth/signup", {
        method: "POST",
        body: { name: "", email: "nope", password: "short" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).fields).toEqual({
      name: "Enter your name.",
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
    });
  });

  it("limits signups to 5 per IP per hour", async () => {
    const body = (n: number) => ({
      name: "A",
      email: `a${n}@example.com`,
      password: "at-least-8-chars",
    });
    for (let n = 0; n < 5; n++) {
      const res = await call(
        signup,
        await request("/api/auth/signup", { method: "POST", body: body(n), ip: "9.9.9.9" }),
      );
      expect(res.status).toBe(201);
    }
    const res = await call(
      signup,
      await request("/api/auth/signup", { method: "POST", body: body(6), ip: "9.9.9.9" }),
    );
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another IP is unaffected.
    const other = await call(
      signup,
      await request("/api/auth/signup", { method: "POST", body: body(7), ip: "8.8.8.8" }),
    );
    expect(other.status).toBe(201);
  }, 30_000);

  it("refuses a request from another origin", async () => {
    const res = await call(
      signup,
      await request("/api/auth/signup", {
        method: "POST",
        origin: "https://evil.example",
        body: { name: "A", email: "a@example.com", password: "at-least-8-chars" },
      }),
    );
    expect(res.status).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe("POST /api/auth/login", () => {
  const attempt = async (email: string, password: string, ip = "1.1.1.1") =>
    call(
      login,
      await request("/api/auth/login", { method: "POST", body: { email, password }, ip }),
    );

  it("logs in with the right password and returns the wedding for a member", async () => {
    const { user } = await createMember("admin", "leela@example.com");
    const res = await attempt("Leela@example.com", TEST_PASSWORD);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: String(user._id), name: "admin", email: "leela@example.com" });
    expect(body.wedding).toEqual({
      id: expect.any(String),
      brideName: "Priya",
      groomName: "Ravi",
      role: "admin",
    });
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect((await User.findById(user._id))!.lastLoginAt).toBeInstanceOf(Date);
  });

  it("returns wedding null for a user with no workspace", async () => {
    await createUser();
    expect((await (await attempt("leela@example.com", TEST_PASSWORD)).json()).wedding).toBeNull();
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    await createUser();
    const wrongPassword = await attempt("leela@example.com", "wrong-password");
    const unknownEmail = await attempt("nobody@example.com", "wrong-password");
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    expect(wrongPassword.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("locks an email after 5 failed attempts, even for the right password", async () => {
    await createUser();
    for (let n = 0; n < 5; n++) {
      expect((await attempt("leela@example.com", "wrong-password", `2.2.2.${n}`)).status).toBe(401);
    }
    const locked = await attempt("leela@example.com", TEST_PASSWORD, "2.2.2.99");
    expect(locked.status).toBe(429);
    expect((await errorOf(locked)).code).toBe("RATE_LIMITED");
  }, 30_000);

  it("does not count a local IP (development), so one person cannot lock everyone out", async () => {
    // Local addresses: every email still has its own limit, but there is no shared IP key.
    for (let n = 0; n < 6; n++) {
      const res = await attempt(`local${n}@example.com`, "wrong-password", "::1");
      expect(res.status).toBe(401);
    }
    expect(await RateLimit.countDocuments({ key: /^login:ip:/ })).toBe(0);
  }, 30_000);

  it("locks an IP after 5 failed attempts across emails", async () => {
    for (let n = 0; n < 5; n++) await attempt(`user${n}@example.com`, "wrong-password", "3.3.3.3");
    expect((await attempt("another@example.com", "wrong-password", "3.3.3.3")).status).toBe(429);
  }, 30_000);
});

describe("GET /api/auth/me", () => {
  it("answers 401 without a session, with a garbage cookie, or for a deleted account", async () => {
    expect((await call(me, await request("/api/auth/me"))).status).toBe(401);
    expect(
      (await call(me, await request("/api/auth/me", { rawCookie: `${SESSION_COOKIE}=garbage` })))
        .status,
    ).toBe(401);
    const user = await createUser();
    await User.deleteOne({ _id: user._id });
    expect(
      (await call(me, await request("/api/auth/me", { userId: String(user._id) }))).status,
    ).toBe(401);
  });

  it("returns the user and wedding", async () => {
    const { user } = await createMember("manager");
    const body = await (
      await call(me, await request("/api/auth/me", { userId: String(user._id) }))
    ).json();
    expect(body.wedding.role).toBe("manager");
  });

  it("shows no wedding once the member is removed", async () => {
    const { user } = await createMember("manager");
    await Membership.updateOne({ userId: user._id }, { status: "removed" });
    const body = await (
      await call(me, await request("/api/auth/me", { userId: String(user._id) }))
    ).json();
    expect(body.wedding).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie and returns 204", async () => {
    const user = await createUser();
    const res = await call(
      logout,
      await request("/api/auth/logout", { method: "POST", userId: String(user._id) }),
    );
    expect(res.status).toBe(204);
    expect(res.cookies.get(SESSION_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("POST /api/auth/forgot-password", () => {
  const ask = async (email: string) =>
    call(
      forgotPassword,
      await request("/api/auth/forgot-password", { method: "POST", body: { email } }),
    );

  it("limits one address to 10 requests an hour, so it can't drain the email quota", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await call(
        forgotPassword,
        await request("/api/auth/forgot-password", {
          method: "POST",
          body: { email: `nobody${i}@example.com` },
          ip: "9.9.9.9",
        }),
      );
      expect(res.status).toBe(200);
    }
    const eleventh = await call(
      forgotPassword,
      await request("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "another@example.com" },
        ip: "9.9.9.9",
      }),
    );
    expect(eleventh.status).toBe(429);
  });

  it("answers { ok: true } and emails a one-hour link only when the account exists", async () => {
    await createUser();
    const known = await ask("leela@example.com");
    const unknown = await ask("nobody@example.com");
    expect(await known.json()).toEqual({ ok: true });
    expect(await unknown.json()).toEqual({ ok: true });
    expect(known.status).toBe(unknown.status);

    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const mail = sendMailSpy.mock.calls[0]![0];
    expect(mail.to).toBe("leela@example.com");
    const token = /reset-password\?token=([\w-]+)/.exec(mail.text)![1]!;
    const stored = await PasswordReset.findOne({ tokenHash: hashToken(token) }).lean();
    expect(stored).toBeTruthy();
    const ttl = stored!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000);
    // Only the hash is stored, never the token.
    expect(JSON.stringify(await PasswordReset.collection.findOne({}))).not.toContain(token);
  });

  it("replaces the earlier unused link", async () => {
    await createUser();
    await ask("leela@example.com");
    await ask("leela@example.com");
    expect(await PasswordReset.countDocuments()).toBe(1);
  });

  it("limits to 3 requests per email per hour, known or not", async () => {
    for (let n = 0; n < 3; n++) expect((await ask("nobody@example.com")).status).toBe(200);
    expect((await ask("nobody@example.com")).status).toBe(429);
  });

  it("still answers ok when the daily email cap is used up", async () => {
    await createUser();
    await RateLimit.insertMany(
      Array.from({ length: 450 }, () => ({
        key: "email:daily",
        expiresAt: new Date(Date.now() + 3_600_000),
      })),
    );
    const res = await ask("leela@example.com");
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMailSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  async function seedReset(expiresAt = new Date(Date.now() + 3_600_000)) {
    const user = await createUser();
    const token = generateToken();
    await PasswordReset.create({ userId: user._id, tokenHash: hashToken(token), expiresAt });
    return { user, token };
  }
  const reset = async (token: string, password = "brand-new-password") =>
    call(
      resetPassword,
      await request("/api/auth/reset-password", { method: "POST", body: { token, password } }),
    );

  it("sets the new password, logs in, and works only once", async () => {
    const { user, token } = await seedReset();
    const res = await reset(token);
    expect(res.status).toBe(200);
    expect((await res.json()).user.id).toBe(String(user._id));
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();

    // Old password stops working, new one works.
    const oldLogin = await call(
      login,
      await request("/api/auth/login", {
        method: "POST",
        body: { email: "leela@example.com", password: TEST_PASSWORD },
      }),
    );
    expect(oldLogin.status).toBe(401);
    const newLogin = await call(
      login,
      await request("/api/auth/login", {
        method: "POST",
        body: { email: "leela@example.com", password: "brand-new-password" },
      }),
    );
    expect(newLogin.status).toBe(200);

    const again = await reset(token, "another-password-1");
    expect(again.status).toBe(400);
    expect((await errorOf(again)).code).toBe("TOKEN_INVALID");
  }, 30_000);

  it("keeps the link usable when the password could not be saved", async () => {
    const { user, token } = await seedReset();
    // The account vanishes between the link being claimed and the password being saved.
    await User.deleteOne({ _id: user._id });
    const res = await reset(token);
    expect(res.status).toBe(400);
    const stored = await PasswordReset.findOne({ tokenHash: hashToken(token) }).lean();
    expect(stored?.usedAt).toBeFalsy();
  }, 30_000);

  it("answers TOKEN_INVALID for unknown and expired tokens", async () => {
    const { token } = await seedReset(new Date(Date.now() - 1000));
    for (const t of [token, generateToken()]) {
      const res = await reset(t);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("TOKEN_INVALID");
    }
  });

  it("rejects a short new password without using up the link", async () => {
    const { token } = await seedReset();
    expect((await reset(token, "short")).status).toBe(400);
    expect((await reset(token)).status).toBe(200);
  }, 30_000);
});

describe("ending other sessions when the password changes", () => {
  const meWith = async (userId: string, sessionAgeSeconds?: number) =>
    call(me, await request("/api/auth/me", { userId, sessionAgeSeconds }));

  it("a password reset logs out every session issued before it, but not the new one", async () => {
    const user = await createUser();
    const id = String(user._id);
    expect((await meWith(id, 120)).status).toBe(200);

    const token = generateToken();
    await PasswordReset.create({
      userId: user._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const res = await call(
      resetPassword,
      await request("/api/auth/reset-password", {
        method: "POST",
        body: { token, password: "brand-new-password" },
      }),
    );
    expect(res.status).toBe(200);

    expect((await meWith(id, 120)).status).toBe(401); // the session from before the reset
    // The cookie the reset itself sent back works.
    const fresh = res.cookies.get(SESSION_COOKIE)!.value;
    const ok = await call(
      me,
      await request("/api/auth/me", { rawCookie: `${SESSION_COOKIE}=${fresh}` }),
    );
    expect(ok.status).toBe(200);
  }, 30_000);

  it("changing the password logs out other sessions and keeps this one", async () => {
    const user = await createUser();
    const id = String(user._id);
    const res = await call(
      changePassword,
      await request("/api/auth/change-password", {
        method: "POST",
        userId: id,
        sessionAgeSeconds: 120,
        body: { currentPassword: TEST_PASSWORD, newPassword: "changed-password" },
      }),
    );
    // The request used a two-minute-old session, which was still valid when it was made.
    expect(res.status).toBe(204);
    expect((await meWith(id, 120)).status).toBe(401);
    const fresh = res.cookies.get(SESSION_COOKIE)!.value;
    const ok = await call(
      me,
      await request("/api/auth/me", { rawCookie: `${SESSION_COOKIE}=${fresh}` }),
    );
    expect(ok.status).toBe(200);
  }, 30_000);

  it("a failed change (wrong current password) ends nothing", async () => {
    const user = await createUser();
    const id = String(user._id);
    const res = await call(
      changePassword,
      await request("/api/auth/change-password", {
        method: "POST",
        userId: id,
        body: { currentPassword: "wrong-password", newPassword: "changed-password" },
      }),
    );
    expect(res.status).toBe(401);
    expect((await meWith(id, 120)).status).toBe(200);
  }, 30_000);

  it("sessions issued after the change keep working", async () => {
    const user = await createUser();
    await User.updateOne({ _id: user._id }, { passwordChangedAt: new Date(Date.now() - 5000) });
    expect((await meWith(String(user._id))).status).toBe(200);
    expect((await meWith(String(user._id), 60)).status).toBe(401);
  });
});

describe("POST /api/auth/change-password", () => {
  const change = async (userId: string | undefined, body: unknown) =>
    call(
      changePassword,
      await request("/api/auth/change-password", { method: "POST", body, userId }),
    );

  it("answers 401 without a session", async () => {
    expect(
      (await change(undefined, { currentPassword: "x", newPassword: "long-enough-1" })).status,
    ).toBe(401);
  });

  it("stops guessing the current password after 5 wrong tries", async () => {
    const user = await createUser();
    const wrong = { currentPassword: "not-the-password", newPassword: "long-enough-1" };
    for (let i = 0; i < 5; i++) expect((await change(String(user._id), wrong)).status).toBe(401);
    // The sixth is refused without checking, even with the right password.
    const sixth = await change(String(user._id), {
      currentPassword: TEST_PASSWORD,
      newPassword: "long-enough-1",
    });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBeTruthy();
  }, 60_000);

  it("changes the password when the current one is right", async () => {
    const user = await createUser();
    const res = await change(String(user._id), {
      currentPassword: TEST_PASSWORD,
      newPassword: "changed-password",
    });
    expect(res.status).toBe(204);
    const next = await call(
      login,
      await request("/api/auth/login", {
        method: "POST",
        body: { email: "leela@example.com", password: "changed-password" },
      }),
    );
    expect(next.status).toBe(200);
  }, 30_000);

  it("refuses a wrong current password and leaves the password alone", async () => {
    const user = await createUser();
    const res = await change(String(user._id), {
      currentPassword: "wrong-password",
      newPassword: "changed-password",
    });
    expect((await errorOf(res)).code).toBe("INVALID_CREDENTIALS");
    const still = await call(
      login,
      await request("/api/auth/login", {
        method: "POST",
        body: { email: "leela@example.com", password: TEST_PASSWORD },
      }),
    );
    expect(still.status).toBe(200);
  }, 30_000);
});
