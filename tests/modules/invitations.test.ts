import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Only the SMTP transport is replaced. The database, the daily cap in lib/mailer.ts, the rate
// limits and every service run for real, and no email leaves the machine.
const sendMailSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

import { GET as quotaRoute } from "@/app/api/invitations/quota/route";
import { GET as previewRoute } from "@/app/api/invitations/preview/route";
import { POST as testRoute } from "@/app/api/invitations/test/route";
import { GET as sendRoute } from "@/app/api/invitations/sends/[id]/route";
import { POST as cancelRoute } from "@/app/api/invitations/sends/[id]/cancel/route";
import { POST as nextRoute } from "@/app/api/invitations/sends/[id]/next/route";
import { POST as retryRoute } from "@/app/api/invitations/sends/[id]/retry-failed/route";
import { GET as listSendsRoute, POST as startRoute } from "@/app/api/invitations/sends/route";
import { RateLimit } from "@/lib/rate-limit";
import { encryptToken, generateToken, hashToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { Guest } from "@/modules/guests/model";
import { deleteGuest } from "@/modules/guests/service";
import { regenerateGuestLink } from "@/modules/invitations/token";
import { deleteEvent } from "@/modules/events/service";
import { BATCH_SIZE } from "@/modules/invitations/service";
import { InvitationSend } from "@/modules/invitations/model";
import { renderInvitationEmail } from "@/modules/invitations/templates";
import { Rsvp } from "@/modules/rsvp/model";
import { Wedding } from "@/modules/weddings/model";
import { createMember, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(async () => {
  await emptyDb();
  sendMailSpy.mockReset();
  sendMailSpy.mockResolvedValue({});
});
afterAll(() => mongoose.disconnect());

const ID_CTX = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const NO_CTX = { params: Promise.resolve({}) } as never;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeEvent(weddingId: Types.ObjectId, name: string, date: string, extra = {}) {
  return Event.create({
    weddingId,
    name,
    type: "Haldi",
    date,
    time: "10:00",
    venueName: `${name} Hall`,
    ...extra,
  });
}

let counter = 0;
async function makeGuest(
  weddingId: Types.ObjectId,
  eventIds: Types.ObjectId[],
  extra: Record<string, unknown> = {},
) {
  const token = generateToken();
  const n = ++counter;
  const guest = await Guest.create({
    weddingId,
    name: `Guest ${String(n).padStart(3, "0")}`,
    email: `guest${n}@example.com`,
    eventIds,
    inviteTokenHash: hashToken(token),
    inviteTokenEnc: encryptToken(token),
    ...extra,
  });
  return { guest, token };
}

async function setup(guestCount = 0) {
  const { user, weddingId } = await createMember("admin");
  const haldi = await makeEvent(weddingId, "Haldi", "2027-02-11", { address: "12 Rose Street" });
  const wedding = await makeEvent(weddingId, "Wedding", "2027-02-14");
  const guests = [];
  for (let i = 0; i < guestCount; i++)
    guests.push(await makeGuest(weddingId, [haldi._id, wedding._id]));
  return { userId: String(user._id), wid: String(weddingId), weddingId, haldi, wedding, guests };
}

const start = async (userId: string, body: unknown) =>
  startRoute(await request("/api/invitations/sends", { method: "POST", body, userId }), NO_CTX);
const next = async (userId: string, id: string) =>
  nextRoute(
    await request(`/api/invitations/sends/${id}/next`, { method: "POST", userId }),
    ID_CTX(id),
  );
const started = async (userId: string, body: unknown) => {
  const res = await start(userId, body);
  expect(res.status).toBe(201);
  return (await res.json()) as { send: { id: string; total: number; skippedNoEmail: number } };
};
const recipients = () => sendMailSpy.mock.calls.map((c) => c[0].to as string);

describe("starting a send", () => {
  it("fixes the guest list, skips guests without an email and reports them", async () => {
    const { userId, weddingId, haldi, guests } = await setup(3);
    await makeGuest(weddingId, [haldi._id], { email: undefined });
    await makeGuest(weddingId, []); // not invited to anything: not included at all
    const { send } = await started(userId, { kind: "invite" });
    const skippedNoEmail = send.skippedNoEmail;
    expect(send).toMatchObject({
      kind: "invite",
      status: "in_progress",
      total: 3,
      sent: 0,
      failed: 0,
    });
    expect(skippedNoEmail).toBe(1);
    const stored = (await InvitationSend.findById(send.id).lean())!;
    expect(stored.guestIds.map(String)).toEqual(guests.map((g) => String(g.guest._id)));
    // Left out `eventIds`: every event.
    expect(stored.eventIds).toHaveLength(2);
    // Guests added later are not part of it.
    await makeGuest(weddingId, [haldi._id]);
    expect((await InvitationSend.findById(send.id).lean())!.guestIds).toHaveLength(3);
  });

  it("covers only the chosen events and only guests invited to them", async () => {
    const { userId, weddingId, haldi, wedding } = await setup();
    const a = await makeGuest(weddingId, [haldi._id]);
    await makeGuest(weddingId, [wedding._id]);
    const { send } = await started(userId, { kind: "invite", eventIds: [String(haldi._id)] });
    expect(send.total).toBe(1);
    expect((await InvitationSend.findById(send.id).lean())!.guestIds.map(String)).toEqual([
      String(a.guest._id),
    ]);
    // Chosen guests (and a stranger's id) narrow it further.
    await InvitationSend.deleteMany({});
    const other = await createMember("admin");
    const strange = await makeGuest(other.weddingId, [haldi._id]);
    const narrowed = await started(userId, {
      kind: "invite",
      guestFilter: { guestIds: [String(a.guest._id), String(strange.guest._id)] },
    });
    expect(narrowed.send.total).toBe(1);
  });

  it("refuses a second send while one is in progress or paused, and bad input", async () => {
    const { userId, weddingId, haldi } = await setup(2);
    const { send } = await started(userId, { kind: "invite" });
    const again = await start(userId, { kind: "invite" });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("SEND_IN_PROGRESS");
    expect(await InvitationSend.countDocuments()).toBe(1);
    await InvitationSend.updateOne({ _id: send.id }, { status: "paused_daily_limit" });
    expect((await start(userId, { kind: "invite" })).status).toBe(409);
    await InvitationSend.updateOne({ _id: send.id }, { status: "completed" });
    expect((await start(userId, { kind: "invite" })).status).toBe(201);

    await InvitationSend.deleteMany({});
    const foreign = await createMember("admin");
    const foreignEvent = await makeEvent(foreign.weddingId, "Theirs", "2027-03-01");
    for (const body of [
      { kind: "party" },
      { kind: "invite", eventIds: [] },
      { kind: "invite", eventIds: [String(foreignEvent._id)] },
      { kind: "invite", eventIds: ["nope"] },
    ]) {
      expect((await start(userId, body)).status, JSON.stringify(body)).toBe(400);
    }
    // Nobody to email: 400 and no record.
    await Guest.updateMany({ weddingId }, { $unset: { email: 1 } });
    const none = await start(userId, { kind: "invite", eventIds: [String(haldi._id)] });
    expect(none.status).toBe(400);
    expect(await InvitationSend.countDocuments()).toBe(0);
  });

  it("two starts at the same moment make only one send", async () => {
    const { userId } = await setup(3);
    const results = await Promise.all([
      start(userId, { kind: "invite" }),
      start(userId, { kind: "invite" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await InvitationSend.countDocuments()).toBe(1);
  });
});

describe("sending in batches", () => {
  it("sends 20 at a time, each guest once, and records progress", async () => {
    expect(BATCH_SIZE).toBe(20);
    const { userId, guests } = await setup(45);
    const { send } = await started(userId, { kind: "invite" });

    const progress: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await next(userId, send.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      progress.push(body.send.sent);
      expect(body.quota.remainingToday).toBe(450 - sendMailSpy.mock.calls.length);
    }
    expect(progress).toEqual([20, 40, 45]);
    const finished = (await InvitationSend.findById(send.id).lean())!;
    expect(finished.status).toBe("completed");
    expect(finished.completedAt).toBeInstanceOf(Date);
    expect(finished.lockedUntil).toBeUndefined();
    expect(recipients().sort()).toEqual(guests.map((g) => g.guest.email!).sort());
    expect(new Set(recipients()).size).toBe(45);
    expect(await RateLimit.countDocuments({ key: "gmail:daily" })).toBe(45);
    expect(await Guest.countDocuments({ lastInviteSentAt: { $exists: true } })).toBe(45);

    // A finished send answers with where it ended and sends nothing more.
    const done = await next(userId, send.id);
    expect(done.status).toBe(200);
    expect((await done.json()).send).toMatchObject({ status: "completed", sent: 45 });
    expect(sendMailSpy).toHaveBeenCalledTimes(45);
  });

  it("emails each guest only their own events, with their own link, and no tracking pixel", async () => {
    const { userId, weddingId, haldi, wedding } = await setup();
    const a = await makeGuest(weddingId, [haldi._id]);
    const b = await makeGuest(weddingId, [haldi._id, wedding._id]);
    const { send } = await started(userId, { kind: "invite" });
    await next(userId, send.id);
    const mails = new Map(sendMailSpy.mock.calls.map((c) => [c[0].to as string, c[0]]));
    const mailA = mails.get(a.guest.email!)!;
    const mailB = mails.get(b.guest.email!)!;
    expect(mailA.text).toContain("Haldi");
    expect(mailA.text).not.toContain("Wedding Hall");
    expect(mailB.text).toContain("Wedding Hall");
    expect(mailA.text).toContain(`http://localhost:3000/i/${a.token}`);
    expect(mailA.html).toContain(`http://localhost:3000/i/${a.token}`);
    expect(mailA.text).not.toContain(b.token);
    expect(mailA.text).not.toContain("/w/"); // no website link until Phase 7
    expect(mailA.subject).toBe("You're invited to the wedding of Priya and Ravi");
    expect(mailA.html).not.toMatch(/<img|<script/i);
    expect(mailA.from).toEqual({ name: "Make My Marriage", address: "sender@example.com" });
  });

  it("a failed address does not stop the send, and retry tries only the failed ones", async () => {
    const { userId, guests } = await setup(5);
    const bad = guests[2]!.guest.email!;
    sendMailSpy.mockImplementation(async (mail: { to: string }) => {
      if (mail.to === bad)
        throw Object.assign(new Error(`rejected ${mail.to}`), { code: "EENVELOPE" });
      return {};
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { send } = await started(userId, { kind: "invite" });
    const res = await (await next(userId, send.id)).json();
    expect(res.send).toMatchObject({ status: "completed", sent: 4, failed: 1 });
    // The log has ids and a code, never the address.
    expect(JSON.stringify(errors.mock.calls)).not.toContain("@");
    errors.mockRestore();
    // The failed guest did not use up a daily place.
    expect(await RateLimit.countDocuments({ key: "gmail:daily" })).toBe(4);

    const detail = await (
      await sendRoute(
        await request(`/api/invitations/sends/${send.id}`, { userId }),
        ID_CTX(send.id),
      )
    ).json();
    expect(detail.failedGuests).toEqual([
      { id: String(guests[2]!.guest._id), name: guests[2]!.guest.name, email: bad },
    ]);

    sendMailSpy.mockReset();
    sendMailSpy.mockResolvedValue({});
    const retry = await retryRoute(
      await request(`/api/invitations/sends/${send.id}/retry-failed`, { method: "POST", userId }),
      ID_CTX(send.id),
    );
    expect((await retry.json()).send).toMatchObject({ status: "in_progress", sent: 4, failed: 0 });
    const again = await (await next(userId, send.id)).json();
    expect(again.send).toMatchObject({ status: "completed", sent: 5, failed: 0 });
    expect(recipients()).toEqual([bad]);
  });

  it("reminders go only to guests who have not answered at least one of their events", async () => {
    const { userId, weddingId, haldi, wedding } = await setup();
    const none = await makeGuest(weddingId, [haldi._id, wedding._id]);
    const some = await makeGuest(weddingId, [haldi._id, wedding._id]);
    const all = await makeGuest(weddingId, [haldi._id, wedding._id]);
    const noEmail = await makeGuest(weddingId, [haldi._id], { email: undefined });
    const answer = (g: { guest: { _id: Types.ObjectId } }, e: Types.ObjectId) =>
      Rsvp.create({
        weddingId,
        guestId: g.guest._id,
        eventId: e,
        attending: true,
        headcount: 1,
        respondedAt: new Date(),
      });
    await answer(some, haldi._id);
    await answer(all, haldi._id);
    await answer(all, wedding._id);

    const { send } = await started(userId, { kind: "reminder" });
    const skippedNoEmail = send.skippedNoEmail;
    expect(send.total).toBe(2);
    expect(skippedNoEmail).toBe(1);
    void noEmail;
    await next(userId, send.id);
    expect(recipients().sort()).toEqual([none.guest.email!, some.guest.email!].sort());
    expect(sendMailSpy.mock.calls[0]![0].subject).toMatch(/^Reminder: /);
    const after = await Guest.find({ weddingId }).lean();
    const byEmail = new Map(after.map((g) => [g.email, g]));
    expect(byEmail.get(none.guest.email!)).toMatchObject({ reminderCount: 1 });
    expect(byEmail.get(none.guest.email!)!.lastReminderSentAt).toBeInstanceOf(Date);
    expect(byEmail.get(none.guest.email!)!.lastInviteSentAt).toBeUndefined();
    expect(byEmail.get(all.guest.email!)).toMatchObject({ reminderCount: 0 });

    // Only the chosen event counts: for Wedding alone, "some" has not answered it, "all" has.
    await InvitationSend.deleteMany({});
    const wedOnly = await started(userId, { kind: "reminder", eventIds: [String(wedding._id)] });
    expect(wedOnly.send.total).toBe(2);
    // A second reminder raises the count.
    await InvitationSend.deleteMany({});
    sendMailSpy.mockClear();
    const second = await started(userId, {
      kind: "reminder",
      guestFilter: { guestIds: [String(none.guest._id)] },
    });
    await next(userId, second.send.id);
    expect((await Guest.findById(none.guest._id))!.reminderCount).toBe(2);
  });

  it("the invitation filters pick guests by status, and not_replied also works for invites", async () => {
    const { userId, weddingId, haldi } = await setup();
    const fresh = await makeGuest(weddingId, [haldi._id]);
    const sent = await makeGuest(weddingId, [haldi._id], { lastInviteSentAt: new Date() });
    const opened = await makeGuest(weddingId, [haldi._id], {
      lastInviteSentAt: new Date(),
      inviteOpenedAt: new Date(),
    });
    const total = async (guestFilter: unknown) => {
      await InvitationSend.deleteMany({});
      return (await started(userId, { kind: "invite", guestFilter })).send.total;
    };
    expect(await total({ inviteStatus: "not_sent" })).toBe(1);
    expect(await total({ inviteStatus: "sent" })).toBe(1);
    expect(await total({ inviteStatus: "opened" })).toBe(1);
    await Rsvp.create({
      weddingId,
      guestId: sent.guest._id,
      eventId: haldi._id,
      attending: false,
      headcount: 0,
      respondedAt: new Date(),
    });
    expect(await total({ rsvpStatus: "not_replied" })).toBe(2);
    void fresh;
    void opened;
  });

  it("stops at the daily cap, says so, and carries on once the day has passed", async () => {
    const { userId, guests } = await setup(30);
    // 445 of the 450 places are already used (by any email the app sent).
    await RateLimit.insertMany(
      Array.from({ length: 445 }, () => ({
        key: "gmail:daily",
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    );
    const { send } = await started(userId, { kind: "invite" });
    const first = await (await next(userId, send.id)).json();
    expect(sendMailSpy).toHaveBeenCalledTimes(5);
    expect(first.send).toMatchObject({ status: "paused_daily_limit", sent: 5, total: 30 });
    expect(first.quota.remainingToday).toBe(0);

    // Calling again the same day sends nothing and stays paused.
    const same = await (await next(userId, send.id)).json();
    expect(same.send.status).toBe("paused_daily_limit");
    expect(sendMailSpy).toHaveBeenCalledTimes(5);
    expect((await InvitationSend.findById(send.id).lean())!.lockedUntil).toBeUndefined();
    const quota = await (
      await quotaRoute(await request("/api/invitations/quota", { userId }), NO_CTX)
    ).json();
    expect(quota).toEqual({ cap: 450, usedLast24h: 450, remainingToday: 0 });

    // The next day (every hit is now 25 hours old) it resumes where it stopped.
    await RateLimit.collection.updateMany(
      { key: "gmail:daily" },
      { $set: { createdAt: new Date(Date.now() - 25 * 3_600_000) } },
    );
    const resumed = await (await next(userId, send.id)).json();
    expect(resumed.send).toMatchObject({ status: "in_progress", sent: 25 });
    const last = await (await next(userId, send.id)).json();
    expect(last.send).toMatchObject({ status: "completed", sent: 30, failed: 0 });
    expect(new Set(recipients()).size).toBe(30);
    expect(recipients().sort()).toEqual(guests.map((g) => g.guest.email!).sort());
  });

  it("pauses at once when the cap is hit part-way through a batch, keeping what was sent", async () => {
    const { userId } = await setup(10);
    await RateLimit.insertMany(
      Array.from({ length: 447 }, () => ({
        key: "gmail:daily",
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    );
    const { send } = await started(userId, { kind: "invite" });
    const res = await (await next(userId, send.id)).json();
    expect(res.send).toMatchObject({ status: "paused_daily_limit", sent: 3 });
    expect(sendMailSpy).toHaveBeenCalledTimes(3);
  });

  it("two batches at once never email a guest twice: one runs, the other gets SEND_BUSY", async () => {
    for (let round = 0; round < 3; round++) {
      await emptyDb();
      sendMailSpy.mockReset();
      // Slow enough that the calls really overlap.
      sendMailSpy.mockImplementation(async () => {
        await sleep(15);
        return {};
      });
      const { userId } = await setup(30);
      const { send } = await started(userId, { kind: "invite" });
      const results = await Promise.all([1, 2, 3, 4].map(() => next(userId, send.id)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses, `round ${round}`).toEqual([200, 409, 409, 409]);
      const busy = results.find((r) => r.status === 409)!;
      expect((await busy.json()).error.code).toBe("SEND_BUSY");
      expect(sendMailSpy).toHaveBeenCalledTimes(20);
      expect(new Set(recipients()).size).toBe(20);
      expect((await InvitationSend.findById(send.id).lean())!.sentGuestIds).toHaveLength(20);
    }
  }, 60_000);

  it("a batch still holding its claim blocks others, and an expired claim can be taken over", async () => {
    const { userId, guests } = await setup(25);
    const { send } = await started(userId, { kind: "invite" });
    await InvitationSend.updateOne(
      { _id: send.id },
      { lockedUntil: new Date(Date.now() + 30_000) },
    );
    const blocked = await next(userId, send.id);
    expect(blocked.status).toBe(409);
    expect(sendMailSpy).not.toHaveBeenCalled();
    // A crashed worker's claim runs out: the send carries on from what was recorded.
    await InvitationSend.updateOne(
      { _id: send.id },
      {
        lockedUntil: new Date(Date.now() - 1000),
        sentGuestIds: [guests[0]!.guest._id, guests[1]!.guest._id],
      },
    );
    const res = await (await next(userId, send.id)).json();
    expect(res.send.sent).toBe(22);
    expect(recipients()).not.toContain(guests[0]!.guest.email);
    expect(recipients()).not.toContain(guests[1]!.guest.email);
  });

  it("records progress after every email, so a failure part-way loses nothing sent", async () => {
    const { userId } = await setup(8);
    let calls = 0;
    sendMailSpy.mockImplementation(async () => {
      if (++calls === 6) throw Object.assign(new Error("boom"), { code: "ECONNRESET" });
      return {};
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { send } = await started(userId, { kind: "invite" });
    const res = await (await next(userId, send.id)).json();
    errors.mockRestore();
    expect(res.send).toMatchObject({ status: "completed", sent: 7, failed: 1 });
    const stored = (await InvitationSend.findById(send.id).lean())!;
    expect(stored.sentGuestIds).toHaveLength(7);
    expect(stored.failedGuestIds).toHaveLength(1);
  });

  it("passes over a guest deleted after the send started", async () => {
    const { userId, wid, guests } = await setup(4);
    const { send } = await started(userId, { kind: "invite" });
    await deleteGuest(wid, String(guests[1]!.guest._id));
    const res = await (await next(userId, send.id)).json();
    expect(res.send).toMatchObject({ status: "completed", total: 3, sent: 3 });
    expect(recipients()).not.toContain(guests[1]!.guest.email);
  });

  it("can be cancelled, and a cancelled send sends nothing more", async () => {
    const { userId } = await setup(30);
    const { send } = await started(userId, { kind: "invite" });
    await next(userId, send.id);
    const res = await cancelRoute(
      await request(`/api/invitations/sends/${send.id}/cancel`, { method: "POST", userId }),
      ID_CTX(send.id),
    );
    expect((await res.json()).send).toMatchObject({ status: "cancelled", sent: 20 });
    sendMailSpy.mockClear();
    const after = await next(userId, send.id);
    expect((await after.json()).send.status).toBe("cancelled");
    expect(sendMailSpy).not.toHaveBeenCalled();
    // And a new send can start.
    expect((await start(userId, { kind: "invite" })).status).toBe(201);
  });

  it("another Admin or Manager can resume a send someone else started", async () => {
    const { userId, weddingId } = await setup(5);
    const { send } = await started(userId, { kind: "invite" });
    const manager = await createMember("manager", "m@example.com", weddingId);
    const res = await next(String(manager.user._id), send.id);
    expect(res.status).toBe(200);
    expect((await res.json()).send).toMatchObject({ status: "completed", sent: 5 });
    const list = await (
      await listSendsRoute(
        await request("/api/invitations/sends", { userId: String(manager.user._id) }),
        NO_CTX,
      )
    ).json();
    expect(list.items).toHaveLength(1);
  });
});

describe("access", () => {
  it("needs a login, and another wedding's send answers 404", async () => {
    const { userId, guests } = await setup(2);
    const { send } = await started(userId, { kind: "invite" });
    const stranger = await createMember("admin");
    const strangerId = String(stranger.user._id);
    const calls: [string, () => Promise<Response>][] = [
      ["next", async () => next(strangerId, send.id)],
      [
        "get",
        async () =>
          sendRoute(
            await request(`/api/invitations/sends/${send.id}`, { userId: strangerId }),
            ID_CTX(send.id),
          ),
      ],
      [
        "cancel",
        async () =>
          cancelRoute(
            await request(`/api/invitations/sends/${send.id}/cancel`, {
              method: "POST",
              userId: strangerId,
            }),
            ID_CTX(send.id),
          ),
      ],
      [
        "retry",
        async () =>
          retryRoute(
            await request(`/api/invitations/sends/${send.id}/retry-failed`, {
              method: "POST",
              userId: strangerId,
            }),
            ID_CTX(send.id),
          ),
      ],
      [
        "preview",
        async () =>
          previewRoute(
            await request(`/api/invitations/preview?guestId=${guests[0]!.guest._id}&kind=invite`, {
              userId: strangerId,
            }),
            NO_CTX,
          ),
      ],
      [
        "test",
        async () =>
          testRoute(
            await request("/api/invitations/test", {
              method: "POST",
              body: { guestId: String(guests[0]!.guest._id), kind: "invite" },
              userId: strangerId,
            }),
            NO_CTX,
          ),
      ],
    ];
    for (const [name, call] of calls) expect((await call()).status, name).toBe(404);
    expect(sendMailSpy).not.toHaveBeenCalled();

    const anon: [string, () => Promise<Response>][] = [
      [
        "start",
        async () =>
          startRoute(
            await request("/api/invitations/sends", { method: "POST", body: { kind: "invite" } }),
            NO_CTX,
          ),
      ],
      ["list", async () => listSendsRoute(await request("/api/invitations/sends"), NO_CTX)],
      [
        "get",
        async () => sendRoute(await request(`/api/invitations/sends/${send.id}`), ID_CTX(send.id)),
      ],
      [
        "next",
        async () =>
          nextRoute(
            await request(`/api/invitations/sends/${send.id}/next`, { method: "POST" }),
            ID_CTX(send.id),
          ),
      ],
      [
        "cancel",
        async () =>
          cancelRoute(
            await request(`/api/invitations/sends/${send.id}/cancel`, { method: "POST" }),
            ID_CTX(send.id),
          ),
      ],
      [
        "retry",
        async () =>
          retryRoute(
            await request(`/api/invitations/sends/${send.id}/retry-failed`, { method: "POST" }),
            ID_CTX(send.id),
          ),
      ],
      ["quota", async () => quotaRoute(await request("/api/invitations/quota"), NO_CTX)],
      [
        "preview",
        async () =>
          previewRoute(
            await request(`/api/invitations/preview?guestId=${guests[0]!.guest._id}`),
            NO_CTX,
          ),
      ],
      [
        "test",
        async () =>
          testRoute(
            await request("/api/invitations/test", {
              method: "POST",
              body: { guestId: String(guests[0]!.guest._id) },
            }),
            NO_CTX,
          ),
      ],
    ];
    for (const [name, call] of anon) expect((await call()).status, name).toBe(401);
    // Writes also check the Origin header.
    const bad = await startRoute(
      await request("/api/invitations/sends", {
        method: "POST",
        body: { kind: "invite" },
        userId,
        origin: "https://evil.example",
      }),
      NO_CTX,
    );
    expect(bad.status).toBe(403);
  });

  it("the preview shows one guest's email and the test goes to the member only", async () => {
    const { userId, weddingId, haldi } = await setup();
    const g = await makeGuest(weddingId, [haldi._id], { name: "Lakshmi <b>Rao</b>" });
    const res = await previewRoute(
      await request(`/api/invitations/preview?guestId=${g.guest._id}&kind=reminder`, { userId }),
      NO_CTX,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.subject).toMatch(/^Reminder: /);
    expect(body.html).toContain("Lakshmi &lt;b&gt;Rao&lt;/b&gt;");
    expect(body.html).not.toContain("<b>Rao</b>");
    expect(body.html).toContain(g.token);
    expect(sendMailSpy).not.toHaveBeenCalled();

    const test = await testRoute(
      await request("/api/invitations/test", {
        method: "POST",
        body: { guestId: String(g.guest._id), kind: "invite" },
        userId,
      }),
      NO_CTX,
    );
    expect(await test.json()).toEqual({ ok: true });
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const mail = sendMailSpy.mock.calls[0]![0];
    expect(mail.to).toMatch(/^admin-.*@example\.com$/);
    expect(mail.subject.startsWith("[Test] ")).toBe(true);
    // It counted toward the daily cap.
    expect(await RateLimit.countDocuments({ key: "gmail:daily" })).toBe(1);
    // A guest with no events cannot be previewed.
    const lonely = await makeGuest(weddingId, []);
    const none = await previewRoute(
      await request(`/api/invitations/preview?guestId=${lonely.guest._id}`, { userId }),
      NO_CTX,
    );
    expect(none.status).toBe(400);
  });
});

describe("the email template", () => {
  const base = {
    kind: "invite" as const,
    brideName: "Priya",
    groomName: "Ravi",
    guestName: "Lakshmi",
    websiteUrl: "http://localhost:3000/w/priya-weds-ravi",
    inviteUrl: "http://localhost:3000/i/abc",
    events: [{ name: "Haldi", date: "2027-02-11", time: "10:00", venueName: "Rose Hall" }],
  };

  it("escapes every inserted value", () => {
    const evil = `<script>alert("x")</script>`;
    const mail = renderInvitationEmail({
      ...base,
      brideName: evil,
      groomName: `"><img src=x onerror=alert(1)>`,
      guestName: `<b>${evil}</b>`,
      events: [
        {
          name: `<i>${evil}</i>`,
          date: "2027-02-11",
          time: "19:30",
          venueName: `A & B "Hall" <u>`,
          address: `<a href="javascript:alert(1)">x</a>`,
          dressCode: `'><svg onload=alert(1)>`,
          mapLink: `https://maps.example.com/?q=a"b&c=<d>`,
        },
      ],
    });
    expect(mail.html).not.toMatch(/<script|<img|<svg|<i>|<b>|<u>|<a href="javascript/i);
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("A &amp; B &quot;Hall&quot; &lt;u&gt;");
    // Every attribute value is quoted and escaped.
    const hrefs = [...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
    expect(hrefs.every((h) => !/[<>"]/.test(h))).toBe(true);
    expect(mail.html).toContain("7:30 PM");
  });

  it("uses a map link only when it is https, and keeps the subject on one line", () => {
    for (const mapLink of [
      "javascript:alert(1)",
      "http://insecure.example/map",
      "data:text/html,x",
      "not a url",
      "",
    ]) {
      const mail = renderInvitationEmail({ ...base, events: [{ ...base.events[0]!, mapLink }] });
      expect(mail.html, mapLink).not.toContain("View on map");
      expect(mail.text, mapLink).not.toContain("Map:");
    }
    const ok = renderInvitationEmail({
      ...base,
      events: [{ ...base.events[0]!, mapLink: "https://maps.example.com/p" }],
    });
    expect(ok.html).toContain('href="https://maps.example.com/p"');
    expect(ok.text).toContain("Map: https://maps.example.com/p");

    const split = renderInvitationEmail({
      ...base,
      brideName: "Pri\r\nBcc: x@evil.example",
      groomName: "Ra\nvi",
    });
    expect(split.subject).not.toMatch(/[\r\n]/);
    expect(split.subject).toBe(
      "You're invited to the wedding of Pri Bcc: x@evil.example and Ra vi",
    );
  });

  it("has a plain-text part with the same facts, and reads differently for a reminder", () => {
    const invite = renderInvitationEmail(base);
    expect(invite.text).toContain("Dear Lakshmi,");
    expect(invite.text).toContain("Thursday, 11 February 2027 at 10:00 AM");
    expect(invite.text).toContain("Rose Hall");
    expect(invite.text).toContain(base.inviteUrl);
    expect(invite.text).toContain(base.websiteUrl);
    const reminder = renderInvitationEmail({ ...base, kind: "reminder" });
    expect(reminder.subject).toMatch(/^Reminder: /);
    expect(reminder.text).toContain("friendly reminder");
    expect(reminder.html).not.toMatch(/<img/i);
  });
});

describe("review fixes", () => {
  it("answers a start with skippedNoEmail inside the send, as the API design says", async () => {
    const { userId, weddingId, haldi } = await setup(2);
    await makeGuest(weddingId, [haldi._id], { email: undefined });
    const res = await (await start(userId, { kind: "invite" })).json();
    expect(Object.keys(res)).toEqual(["send"]);
    expect(res.send).toMatchObject({ total: 2, skippedNoEmail: 1 });
  });

  it("cancels a send whose events were all deleted, instead of failing every guest", async () => {
    const { userId, wid, weddingId, haldi } = await setup();
    for (let i = 0; i < 3; i++) await makeGuest(weddingId, [haldi._id]);
    const { send } = await started(userId, { kind: "invite", eventIds: [String(haldi._id)] });
    await deleteEvent(wid, String(haldi._id));
    const res = await (await next(userId, send.id)).json();
    expect(res.send).toMatchObject({ status: "cancelled", sent: 0, failed: 0 });
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("passes over a guest taken off every event of the send, without marking them failed", async () => {
    const { userId, weddingId, haldi, wedding } = await setup();
    const keep = await makeGuest(weddingId, [haldi._id]);
    const moved = await makeGuest(weddingId, [haldi._id]);
    const { send } = await started(userId, { kind: "invite", eventIds: [String(haldi._id)] });
    await Guest.updateOne({ _id: moved.guest._id }, { eventIds: [wedding._id] });
    const res = await (await next(userId, send.id)).json();
    expect(res.send).toMatchObject({ status: "completed", total: 1, sent: 1, failed: 0 });
    expect(recipients()).toEqual([keep.guest.email]);
  });

  it("emails the link current at the moment of sending, and a regenerated link makes the guest not-sent", async () => {
    const { userId, wid, weddingId, haldi } = await setup();
    const g = await makeGuest(weddingId, [haldi._id], { lastInviteSentAt: new Date() });
    const { send } = await started(userId, {
      kind: "reminder",
      guestFilter: { guestIds: [String(g.guest._id)] },
    });
    const { link } = await regenerateGuestLink(wid, String(g.guest._id));
    await next(userId, send.id);
    expect(sendMailSpy.mock.calls[0]![0].text).toContain(link);
    expect(sendMailSpy.mock.calls[0]![0].text).not.toContain(g.token);
    // Regenerating again: the emailed link is dead, so the guest is "not sent" once more.
    expect((await Guest.findById(g.guest._id).lean())!.lastInviteSentAt).toBeUndefined();
  });

  it("limits test emails per wedding, and a failed test does not use a place", async () => {
    const { userId, weddingId, haldi } = await setup();
    const g = await makeGuest(weddingId, [haldi._id]);
    const test = async () =>
      testRoute(
        await request("/api/invitations/test", {
          method: "POST",
          body: { guestId: String(g.guest._id) },
          userId,
        }),
        NO_CTX,
      );
    sendMailSpy.mockRejectedValueOnce(new Error("down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await test()).status).toBe(500);
    errors.mockRestore();
    for (let i = 0; i < 10; i++) expect((await test()).status, `test ${i}`).toBe(200);
    const limited = await test();
    expect(limited.status).toBe(429);
    expect(sendMailSpy).toHaveBeenCalledTimes(11);
  });
});

describe("QA fixes", () => {
  it("refuses to start an invitation or a reminder after the RSVP cut-off", async () => {
    const { userId, weddingId } = await setup(2);
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2020-01-01" });
    for (const kind of ["invite", "reminder"]) {
      const res = await start(userId, { kind });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields.kind).toMatch(/cut-off has passed/);
    }
    expect(await InvitationSend.countDocuments()).toBe(0);
    // Moving the cut-off to a later day opens sending again.
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2099-01-01" });
    expect((await start(userId, { kind: "invite" })).status).toBe(201);
  });

  it("asks guests to reply by the cut-off day, and says nothing when there is none", async () => {
    const base = {
      kind: "invite" as const,
      brideName: "Asha",
      groomName: "Ravi",
      guestName: "Lakshmi",
      events: [{ name: "Haldi", date: "2027-02-11", time: "10:00", venueName: "Hall" }],
      websiteUrl: "https://a.example/w/x",
      inviteUrl: "https://a.example/i/t",
    };
    const withDate = renderInvitationEmail({ ...base, replyBy: "2027-01-31" });
    expect(withDate.text).toContain("Please reply by 31 January 2027.");
    expect(withDate.html).toContain("Please reply by 31 January 2027.");
    const without = renderInvitationEmail(base);
    expect(without.text).not.toContain("Please reply by");
  });

  it("puts the cut-off in the emails that really go out", async () => {
    const { userId, weddingId } = await setup(1);
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2099-01-31" });
    const { send } = await started(userId, { kind: "invite" });
    await next(userId, send.id);
    expect(sendMailSpy.mock.calls[0]![0].text).toContain("Please reply by 31 January 2099.");
  });

  it("gives every send error a readable message", async () => {
    const { userId } = await setup(1);
    const { send } = await started(userId, { kind: "invite" });
    const again = await start(userId, { kind: "invite" });
    expect((await again.json()).error.message).toMatch(/already in progress/);
    await InvitationSend.updateOne(
      { _id: send.id },
      { lockedUntil: new Date(Date.now() + 60_000) },
    );
    const busy = await next(userId, send.id);
    expect(busy.status).toBe(409);
    expect((await busy.json()).error.message).toMatch(/Please wait a moment/);
  });
});

describe("QA review fixes", () => {
  it("leaves the wedding-website line out of sent emails until the site exists", async () => {
    const { userId } = await setup(1);
    const { send } = await started(userId, { kind: "invite" });
    await next(userId, send.id);
    const mail = sendMailSpy.mock.calls[0]![0];
    expect(mail.text).not.toContain("Wedding website");
    expect(mail.html).not.toContain("Wedding website");
    expect(mail.text).not.toContain("/w/");
  });

  it("still shows the website line when one is given (Phase 7)", () => {
    const m = renderInvitationEmail({
      kind: "invite",
      brideName: "A",
      groomName: "B",
      guestName: "G",
      events: [{ name: "Haldi", date: "2027-02-11", time: "10:00", venueName: "Hall" }],
      websiteUrl: "https://a.example/w/x",
      inviteUrl: "https://a.example/i/t",
    });
    expect(m.text).toContain("Wedding website: https://a.example/w/x");
    expect(m.html).toContain("Wedding website:");
  });
});
