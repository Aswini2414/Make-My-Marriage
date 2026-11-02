import mongoose, { type Types } from "mongoose";
import type { NextResponse } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Replace Gmail with a spy; the daily-cap logic in lib/mailer.ts still runs for real.
const sendMailSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

import { GET as getWedding } from "@/app/api/wedding/route";
import { POST as acceptInvite, GET as acceptInfo } from "@/app/api/members/accept/route";
import { DELETE as cancelInvite } from "@/app/api/members/invites/[id]/route";
import { POST as resendInvite } from "@/app/api/members/invites/[id]/resend/route";
import { POST as inviteMember } from "@/app/api/members/invites/route";
import { POST as leave } from "@/app/api/members/leave/route";
import { DELETE as removeMember, PATCH as changeRole } from "@/app/api/members/[id]/route";
import { GET as listMembers } from "@/app/api/members/route";
import { SESSION_COOKIE } from "@/lib/session";
import { generateToken, hashToken } from "@/lib/tokens";
import { RateLimit } from "@/lib/rate-limit";
import { User } from "@/modules/auth/model";
import { MemberInvite, Membership } from "@/modules/members/model";
import { createMember, createUser, emptyDb, request, resetDb, TEST_PASSWORD } from "../helpers";

beforeAll(resetDb);
beforeEach(async () => {
  await emptyDb();
  sendMailSpy.mockReset();
  sendMailSpy.mockResolvedValue({});
});
afterAll(() => mongoose.disconnect());

// Route handlers return NextResponse, which has the .cookies the tests read.
const call = (route: (req: never, ctx: never) => Promise<Response>, req: unknown, ctx?: unknown) =>
  route(req as never, ctx as never) as Promise<NextResponse>;
const withId = (id: unknown) => ({ params: Promise.resolve({ id: String(id) }) });

async function errorOf(res: Response) {
  return (await res.json()).error as { code: string; message: string };
}

const uid = (u: { _id: unknown }) => String(u._id);

/** A wedding with an Admin (the creator) and a Manager. */
async function team() {
  const admin = await createMember("admin", "admin@example.com");
  const manager = await createMember("manager", "manager@example.com", admin.weddingId);
  return { admin: admin.user, manager: manager.user, weddingId: admin.weddingId };
}

const membershipOf = (user: { _id: unknown }) =>
  Membership.findOne({ userId: user._id as Types.ObjectId, status: "active" });

/** Sends an invite as the given user and returns the response. */
async function invite(
  as: { _id: unknown },
  body: unknown = { name: "Anil", email: "anil@example.com", role: "manager" },
) {
  return call(
    inviteMember,
    await request("/api/members/invites", { method: "POST", userId: uid(as), body }),
  );
}

/** The token from the last email sent. */
function lastToken() {
  const mail = sendMailSpy.mock.calls.at(-1)![0] as { text: string };
  return decodeURIComponent(/token=(\S+)/.exec(mail.text)![1]!);
}

const accept = async (body: unknown, ip?: string) =>
  call(acceptInvite, await request("/api/members/accept", { method: "POST", body, ip }));

describe("GET /api/members", () => {
  it("lists active members to everyone, and pending invites to Admins only", async () => {
    const { admin, manager } = await team();
    await invite(admin);

    const asAdmin = await call(listMembers, await request("/api/members", { userId: uid(admin) }));
    const body = await asAdmin.json();
    expect(body.items).toEqual([
      expect.objectContaining({ email: "admin@example.com", role: "admin", isCreator: true }),
      expect.objectContaining({ email: "manager@example.com", role: "manager", isCreator: false }),
    ]);
    expect(body.pendingInvites).toEqual([
      expect.objectContaining({ email: "anil@example.com", role: "manager" }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/hash|token/i);

    const asManager = await call(
      listMembers,
      await request("/api/members", { userId: uid(manager) }),
    );
    const managerBody = await asManager.json();
    expect(managerBody.items).toHaveLength(2);
    expect(managerBody.pendingInvites).toBeUndefined();
  });

  it("never lists another wedding's people, or removed members", async () => {
    const { admin, manager } = await team();
    await createMember("admin", "other@example.com");
    await Membership.updateOne({ userId: manager._id }, { status: "removed" });
    const res = await call(listMembers, await request("/api/members", { userId: uid(admin) }));
    const emails = (await res.json()).items.map((m: { email: string }) => m.email);
    expect(emails).toEqual(["admin@example.com"]);
  });

  it("answers 401 without a session and 403 without a wedding", async () => {
    expect((await call(listMembers, await request("/api/members"))).status).toBe(401);
    const loner = await createUser();
    const res = await call(listMembers, await request("/api/members", { userId: uid(loner) }));
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("NO_WORKSPACE");
  });
});

describe("POST /api/members/invites", () => {
  it("creates an invite and emails a link, keeping only the hash", async () => {
    const { admin } = await team();
    const res = await invite(admin, { name: " Anil ", email: "Anil@Example.com", role: "manager" });
    expect(res.status).toBe(201);
    const { invite: body } = await res.json();
    expect(body).toMatchObject({ name: "Anil", email: "anil@example.com", role: "manager" });
    const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const mail = sendMailSpy.mock.calls[0]![0];
    expect(mail.to).toBe("anil@example.com");
    expect(mail.text).toContain("/accept-invite?token=");
    expect(mail.subject).toContain("Priya & Ravi");

    const stored = await MemberInvite.findById(body.id).select("+tokenHash").lean();
    expect(stored!.tokenHash).toBe(hashToken(lastToken()));
    expect(JSON.stringify(body)).not.toContain(lastToken());
  });

  it("is for Admins only", async () => {
    const { manager } = await team();
    const res = await invite(manager);
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("FORBIDDEN");
    expect(await MemberInvite.countDocuments()).toBe(0);
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("answers 401 without a session and 403 from a foreign Origin", async () => {
    const { admin } = await team();
    const body = { name: "A", email: "a@example.com", role: "manager" };
    const none = await call(
      inviteMember,
      await request("/api/members/invites", { method: "POST", body }),
    );
    expect(none.status).toBe(401);
    const foreign = await call(
      inviteMember,
      await request("/api/members/invites", {
        method: "POST",
        userId: uid(admin),
        body,
        origin: "https://evil.example",
      }),
    );
    expect(foreign.status).toBe(403);
  });

  it("names the fields that need fixing", async () => {
    const { admin } = await team();
    const res = await invite(admin, { name: "", email: "nope", role: "owner" });
    expect(res.status).toBe(400);
    const error = (await res.json()).error;
    expect(error.fields).toEqual({
      name: "Enter your name.",
      email: "Enter a valid email address.",
      role: "Choose Admin or Manager.",
    });
  });

  it("refuses someone who is already a member", async () => {
    const { admin } = await team();
    const res = await invite(admin, { name: "M", email: "Manager@example.com", role: "admin" });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("ALREADY_MEMBER");
  });

  it("refuses someone in another workspace, or invited to another one", async () => {
    const { admin } = await team();
    await createMember("admin", "busy@example.com");
    const inOther = await invite(admin, { name: "B", email: "busy@example.com", role: "manager" });
    expect(inOther.status).toBe(409);
    expect((await errorOf(inOther)).code).toBe("IN_OTHER_WORKSPACE");

    const other = await createMember("admin", "other-admin@example.com");
    await invite(other.user, { name: "Z", email: "zed@example.com", role: "manager" });
    const invitedElsewhere = await invite(admin, {
      name: "Z",
      email: "zed@example.com",
      role: "manager",
    });
    expect(invitedElsewhere.status).toBe(409);
    expect((await errorOf(invitedElsewhere)).code).toBe("IN_OTHER_WORKSPACE");
  });

  it("allows someone with an account but no wedding, and someone who was removed", async () => {
    const { admin, manager } = await team();
    await createUser("Free", "free@example.com");
    expect(
      (await invite(admin, { name: "F", email: "free@example.com", role: "manager" })).status,
    ).toBe(201);
    await Membership.updateOne({ userId: manager._id }, { status: "removed" });
    expect(
      (await invite(admin, { name: "M", email: "manager@example.com", role: "manager" })).status,
    ).toBe(201);
  });

  it("replaces the earlier link when the same email is invited again", async () => {
    const { admin } = await team();
    await invite(admin);
    const first = lastToken();
    await invite(admin, { name: "Anil", email: "anil@example.com", role: "admin" });
    const second = lastToken();
    expect(await MemberInvite.countDocuments()).toBe(1);
    expect(
      (await call(acceptInfo, await request(`/api/members/accept?token=${first}`))).status,
    ).toBe(400);
    const info = await call(acceptInfo, await request(`/api/members/accept?token=${second}`));
    expect((await info.json()).role).toBe("admin");
  });

  it("leaves no invite behind when the email can't be sent", async () => {
    const { admin } = await team();
    sendMailSpy.mockRejectedValueOnce(new Error("smtp down"));
    const res = await invite(admin);
    expect(res.status).toBe(500);
    expect(await MemberInvite.countDocuments()).toBe(0);
  });

  it("answers 429 when the daily email cap is reached", async () => {
    const { admin } = await team();
    await RateLimit.create(
      Array.from({ length: 450 }, () => ({
        key: "gmail:daily",
        expiresAt: new Date(Date.now() + 3_600_000),
      })),
    );
    const res = await invite(admin);
    expect(res.status).toBe(429);
    expect((await errorOf(res)).code).toBe("EMAIL_CAP_REACHED");
    expect(await MemberInvite.countDocuments()).toBe(0);
  });
});

describe("resending and cancelling invites", () => {
  it("resend gives a fresh link and kills the old one", async () => {
    const { admin } = await team();
    const { invite: sent } = await (await invite(admin)).json();
    const old = lastToken();
    const res = await call(
      resendInvite,
      await request(`/api/members/invites/${sent.id}/resend`, {
        method: "POST",
        userId: uid(admin),
      }),
      withId(sent.id),
    );
    expect(res.status).toBe(200);
    expect(sendMailSpy).toHaveBeenCalledTimes(2);
    expect(lastToken()).not.toBe(old);
    expect((await call(acceptInfo, await request(`/api/members/accept?token=${old}`))).status).toBe(
      400,
    );
    expect(
      (await call(acceptInfo, await request(`/api/members/accept?token=${lastToken()}`))).status,
    ).toBe(200);
  });

  it("resend keeps the old link if the new email fails", async () => {
    const { admin } = await team();
    const { invite: sent } = await (await invite(admin)).json();
    const old = lastToken();
    sendMailSpy.mockRejectedValueOnce(new Error("smtp down"));
    const res = await call(
      resendInvite,
      await request(`/api/members/invites/${sent.id}/resend`, {
        method: "POST",
        userId: uid(admin),
      }),
      withId(sent.id),
    );
    expect(res.status).toBe(500);
    expect((await call(acceptInfo, await request(`/api/members/accept?token=${old}`))).status).toBe(
      200,
    );
  });

  it("cancel removes the invite and its link", async () => {
    const { admin } = await team();
    const { invite: sent } = await (await invite(admin)).json();
    const token = lastToken();
    const res = await call(
      cancelInvite,
      await request(`/api/members/invites/${sent.id}`, { method: "DELETE", userId: uid(admin) }),
      withId(sent.id),
    );
    expect(res.status).toBe(204);
    expect(
      (await call(acceptInfo, await request(`/api/members/accept?token=${token}`))).status,
    ).toBe(400);
  });

  it("are for Admins of the same wedding only", async () => {
    const { admin, manager } = await team();
    const { invite: sent } = await (await invite(admin)).json();
    const outsider = await createMember("admin", "outsider@example.com");
    for (const [route, method, suffix] of [
      [resendInvite, "POST", "/resend"],
      [cancelInvite, "DELETE", ""],
    ] as const) {
      const path = `/api/members/invites/${sent.id}${suffix}`;
      const asManager = await call(
        route,
        await request(path, { method, userId: uid(manager) }),
        withId(sent.id),
      );
      expect(asManager.status).toBe(403);
      const asOutsider = await call(
        route,
        await request(path, { method, userId: uid(outsider.user) }),
        withId(sent.id),
      );
      expect(asOutsider.status).toBe(404);
      const none = await call(route, await request(path, { method }), withId(sent.id));
      expect(none.status).toBe(401);
    }
    expect(await MemberInvite.countDocuments()).toBe(1);
  });
});

describe("accepting an invite", () => {
  it("tells the page whether the email already has an account", async () => {
    const { admin } = await team();
    await invite(admin);
    const fresh = await call(acceptInfo, await request(`/api/members/accept?token=${lastToken()}`));
    expect(await fresh.json()).toEqual({
      weddingName: "Priya & Ravi",
      weddingDate: "2027-02-14",
      invitedBy: "admin",
      invitedName: "Anil",
      email: "anil@example.com",
      role: "manager",
      hasAccount: false,
    });
    await createUser("Anil", "anil@example.com");
    const known = await call(acceptInfo, await request(`/api/members/accept?token=${lastToken()}`));
    expect((await known.json()).hasAccount).toBe(true);
  });

  it("refuses an unknown, expired or used link", async () => {
    const { admin } = await team();
    await invite(admin);
    const token = lastToken();
    expect(
      (await call(acceptInfo, await request(`/api/members/accept?token=${generateToken()}`)))
        .status,
    ).toBe(400);
    expect((await call(acceptInfo, await request("/api/members/accept"))).status).toBe(400);

    await MemberInvite.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await accept({ token, password: "long-enough-1" });
    expect(expired.status).toBe(400);
    expect((await errorOf(expired)).code).toBe("TOKEN_INVALID");
  });

  it("creates the account, joins the wedding and logs in", async () => {
    const { admin, weddingId } = await team();
    await invite(admin, { name: "Anil", email: "anil@example.com", role: "admin" });
    const res = await accept({
      token: lastToken(),
      password: "at-least-8-chars",
      name: "Anil Kumar",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ name: "Anil Kumar", email: "anil@example.com" });
    expect(body.wedding).toMatchObject({ id: String(weddingId), role: "admin" });
    expect(JSON.stringify(body)).not.toMatch(/hash/i);
    expect(res.cookies.get(SESSION_COOKIE)?.httpOnly).toBe(true);

    const user = await User.findOne({ email: "anil@example.com" }).select("+passwordHash");
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const membership = await membershipOf(user!);
    expect(membership).toMatchObject({ role: "admin", status: "active" });
    expect(String(membership!.invitedBy)).toBe(uid(admin));
    expect((await MemberInvite.findOne().lean())!.acceptedAt).toBeInstanceOf(Date);
  });

  it("uses the invited name when none is given, and enforces the password rules", async () => {
    const { admin } = await team();
    await invite(admin);
    const short = await accept({ token: lastToken(), password: "short" });
    expect(short.status).toBe(400);
    expect((await short.json()).error.fields.password).toBe("Use at least 8 characters.");
    expect(await User.countDocuments({ email: "anil@example.com" })).toBe(0);
    expect((await MemberInvite.findOne().lean())!.acceptedAt).toBeUndefined();

    const ok = await accept({ token: lastToken(), password: "long-enough-1" });
    expect((await ok.json()).user.name).toBe("Anil");
  });

  it("works only once", async () => {
    const { admin } = await team();
    await invite(admin);
    const token = lastToken();
    expect((await accept({ token, password: "long-enough-1" })).status).toBe(200);
    const again = await accept({ token, password: "long-enough-1" });
    expect(again.status).toBe(400);
    expect((await errorOf(again)).code).toBe("TOKEN_INVALID");
  });

  it("lets only one of two simultaneous requests through", async () => {
    const { admin } = await team();
    await invite(admin);
    const token = lastToken();
    const results = await Promise.all([
      accept({ token, password: "long-enough-1" }),
      accept({ token, password: "long-enough-1" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await User.countDocuments({ email: "anil@example.com" })).toBe(1);
    expect(await Membership.countDocuments({ role: "manager" })).toBe(2);
  });

  it("an existing account must give its password, and wrong ones are counted", async () => {
    const { admin } = await team();
    const anil = await createUser("Anil", "anil@example.com");
    await invite(admin);
    const token = lastToken();
    const wrong = await accept({ token, password: "not-the-password" });
    expect(wrong.status).toBe(401);
    expect((await errorOf(wrong)).code).toBe("INVALID_CREDENTIALS");
    expect(await membershipOf(anil)).toBeNull();
    expect(await RateLimit.countDocuments({ key: "login:anil@example.com" })).toBe(1);

    const ok = await accept({ token, password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(await membershipOf(anil)).toMatchObject({ role: "manager" });
    expect((await User.findById(anil._id).lean())!.lastLoginAt).toBeInstanceOf(Date);
  });

  it("locks out password guessing through an invite, like login", async () => {
    const { admin } = await team();
    await createUser("Anil", "anil@example.com");
    await invite(admin);
    const token = lastToken();
    for (let i = 0; i < 5; i++) await accept({ token, password: `wrong-${i}` });
    const locked = await accept({ token, password: TEST_PASSWORD });
    expect(locked.status).toBe(429);
  });

  it("refuses an account that joined another wedding since, and keeps the link", async () => {
    const { admin } = await team();
    const anil = await createUser("Anil", "anil@example.com");
    await invite(admin);
    const token = lastToken();
    const other = await createMember("admin", "other@example.com");
    await Membership.create({
      weddingId: other.weddingId,
      userId: anil._id,
      role: "manager",
      joinedAt: new Date(),
    });
    const res = await accept({ token, password: TEST_PASSWORD });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("IN_OTHER_WORKSPACE");
    expect((await MemberInvite.findOne().lean())!.acceptedAt).toBeUndefined();
  });

  it("drops the person's other pending invites", async () => {
    const { admin } = await team();
    await invite(admin);
    const token = lastToken();
    const other = await createMember("admin", "other@example.com");
    // Created directly: the invite route refuses a second wedding for the same email.
    await MemberInvite.create({
      weddingId: other.weddingId,
      name: "Anil",
      email: "anil@example.com",
      role: "manager",
      tokenHash: hashToken("elsewhere"),
      invitedBy: other.user._id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await accept({ token, password: "long-enough-1" });
    expect(await MemberInvite.countDocuments({ acceptedAt: null })).toBe(0);
  });

  it("lets a removed member be invited back", async () => {
    const { admin, manager } = await team();
    await Membership.updateOne(
      { userId: manager._id },
      { status: "removed", removedAt: new Date() },
    );
    await invite(admin, { name: "M", email: "manager@example.com", role: "manager" });
    const res = await accept({ token: lastToken(), password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(await Membership.countDocuments({ userId: manager._id })).toBe(2);
    expect(await membershipOf(manager)).not.toBeNull();
  });
});

describe("PATCH /api/members/:id", () => {
  const patch = async (as: { _id: unknown } | null, id: unknown, body: unknown) =>
    call(
      changeRole,
      await request(`/api/members/${id}`, {
        method: "PATCH",
        userId: as ? uid(as) : undefined,
        body,
      }),
      withId(id),
    );

  it("promotes a Manager to Admin", async () => {
    const { admin, manager } = await team();
    const target = await membershipOf(manager);
    const res = await patch(admin, target!._id, { role: "admin" });
    expect(res.status).toBe(200);
    expect((await res.json()).member).toMatchObject({
      email: "manager@example.com",
      role: "admin",
    });
  });

  it("demotes an Admin when another Admin remains, and refuses to leave none", async () => {
    const { admin, manager } = await team();
    const adminRow = await membershipOf(admin);
    const managerRow = await membershipOf(manager);
    const last = await patch(admin, adminRow!._id, { role: "manager" });
    expect(last.status).toBe(409);
    expect((await errorOf(last)).code).toBe("LAST_ADMIN");
    expect((await membershipOf(admin))!.role).toBe("admin");

    await patch(admin, managerRow!._id, { role: "admin" });
    const ok = await patch(admin, adminRow!._id, { role: "manager" });
    expect(ok.status).toBe(200);
    // The creator may step down once someone else is Admin.
    expect((await membershipOf(admin))!.role).toBe("manager");
  });

  it("can't leave a wedding with no Admin when two Admins demote each other at once", async () => {
    const { admin, manager } = await team();
    const adminRow = await membershipOf(admin);
    const managerRow = await membershipOf(manager);
    await patch(admin, managerRow!._id, { role: "admin" });
    const results = await Promise.all([
      patch(admin, managerRow!._id, { role: "manager" }),
      patch(manager, adminRow!._id, { role: "manager" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await Membership.countDocuments({ status: "active", role: "admin" })).toBe(1);
  });

  it("is for Admins only, and only for people in the same wedding", async () => {
    const { admin, manager } = await team();
    const managerRow = await membershipOf(manager);
    expect((await patch(manager, managerRow!._id, { role: "admin" })).status).toBe(403);
    expect((await patch(null, managerRow!._id, { role: "admin" })).status).toBe(401);
    expect((await membershipOf(manager))!.role).toBe("manager");

    const outsider = await createMember("admin", "outsider@example.com");
    const outsiderRow = await membershipOf(outsider.user);
    const cross = await patch(admin, outsiderRow!._id, { role: "manager" });
    expect(cross.status).toBe(404);
    expect((await membershipOf(outsider.user))!.role).toBe("admin");
    expect((await patch(admin, "not-an-id", { role: "admin" })).status).toBe(404);
  });

  it("refuses a bad role, and a removed member", async () => {
    const { admin, manager } = await team();
    const row = await membershipOf(manager);
    const bad = await patch(admin, row!._id, { role: "owner" });
    expect(bad.status).toBe(400);
    await Membership.updateOne({ _id: row!._id }, { status: "removed" });
    expect((await patch(admin, row!._id, { role: "admin" })).status).toBe(404);
  });
});

describe("DELETE /api/members/:id", () => {
  const remove = async (as: { _id: unknown } | null, id: unknown) =>
    call(
      removeMember,
      await request(`/api/members/${id}`, { method: "DELETE", userId: as ? uid(as) : undefined }),
      withId(id),
    );

  it("removes a member, who loses access at once", async () => {
    const { admin, manager } = await team();
    const row = await membershipOf(manager);
    const res = await remove(admin, row!._id);
    expect(res.status).toBe(204);
    const stored = await Membership.findById(row!._id).lean();
    expect(stored).toMatchObject({ status: "removed" });
    expect(stored!.removedAt).toBeInstanceOf(Date);
    // The old session still works as a login, but the wedding is gone.
    const after = await call(getWedding, await request("/api/wedding", { userId: uid(manager) }));
    expect(after.status).toBe(403);
    expect((await errorOf(after)).code).toBe("NO_WORKSPACE");
  });

  it("protects the creator from other Admins", async () => {
    const { admin, manager } = await team();
    const managerRow = await membershipOf(manager);
    await Membership.updateOne({ _id: managerRow!._id }, { role: "admin" });
    const adminRow = await membershipOf(admin);
    const res = await remove(manager, adminRow!._id);
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("CREATOR_PROTECTED");
    expect(await membershipOf(admin)).not.toBeNull();
  });

  it("won't remove the only Admin", async () => {
    const { admin } = await team();
    const row = await membershipOf(admin);
    const res = await remove(admin, row!._id);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("LAST_ADMIN");
  });

  it("is for Admins only, and only for people in the same wedding", async () => {
    const { admin, manager } = await team();
    const adminRow = await membershipOf(admin);
    expect((await remove(manager, adminRow!._id)).status).toBe(403);
    expect((await remove(null, adminRow!._id)).status).toBe(401);
    const outsider = await createMember("manager", "outsider@example.com");
    const outsiderRow = await membershipOf(outsider.user);
    expect((await remove(admin, outsiderRow!._id)).status).toBe(404);
    expect(await membershipOf(outsider.user)).not.toBeNull();
  });

  it("removing someone twice answers 404 the second time", async () => {
    const { admin, manager } = await team();
    const row = await membershipOf(manager);
    await remove(admin, row!._id);
    expect((await remove(admin, row!._id)).status).toBe(404);
  });
});

describe("POST /api/members/leave", () => {
  const leaveAs = async (user: { _id: unknown } | null) =>
    call(
      leave,
      await request("/api/members/leave", { method: "POST", userId: user ? uid(user) : undefined }),
    );

  it("lets a Manager leave and keeps the account", async () => {
    const { manager } = await team();
    expect((await leaveAs(manager)).status).toBe(204);
    expect(await User.exists({ _id: manager._id })).toBeTruthy();
    expect(await membershipOf(manager)).toBeNull();
    const after = await call(getWedding, await request("/api/wedding", { userId: uid(manager) }));
    expect(after.status).toBe(403);
  });

  it("won't let the only Admin leave, but the creator can once someone else is Admin", async () => {
    const { admin, manager } = await team();
    const blocked = await leaveAs(admin);
    expect(blocked.status).toBe(409);
    expect((await errorOf(blocked)).code).toBe("LAST_ADMIN");
    await Membership.updateOne({ userId: manager._id }, { role: "admin" });
    expect((await leaveAs(admin)).status).toBe(204);
  });

  it("answers 401 without a session and 403 without a wedding", async () => {
    expect((await leaveAs(null)).status).toBe(401);
    const loner = await createUser();
    expect((await leaveAs(loner)).status).toBe(403);
  });

  it("someone who left can create or join another wedding", async () => {
    const { manager } = await team();
    await leaveAs(manager);
    const other = await createMember("admin", "other@example.com");
    await invite(other.user, { name: "M", email: "manager@example.com", role: "manager" });
    const res = await accept({ token: lastToken(), password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect((await res.json()).wedding.id).toBe(String(other.weddingId));
  });
});
