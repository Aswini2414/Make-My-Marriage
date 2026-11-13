import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getInvitationRoute } from "@/app/api/public/invite/[token]/route";
import { POST as saveRoute } from "@/app/api/public/invite/[token]/rsvp/route";
import { GET as linkRoute } from "@/app/api/guests/[id]/link/route";
import { POST as regenerateRoute } from "@/app/api/guests/[id]/regenerate-link/route";
import { GET as listRoute } from "@/app/api/guests/route";
import { todayIST } from "@/lib/dates";
import { RateLimit } from "@/lib/rate-limit";
import { encryptToken, generateToken, hashToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { deleteEvent, getDeleteImpact, getEvent, listEvents } from "@/modules/events/service";
import { getDashboard } from "@/modules/dashboard/service";
import { deleteImpactLine } from "@/modules/guests/format";
import { Guest } from "@/modules/guests/model";
import { deleteGuest, deleteGuests, getGuest, listGuests } from "@/modules/guests/service";
import { listGuestsQuery } from "@/modules/guests/schema";
import { InvitationSend } from "@/modules/invitations/model";
import { rsvpCountsByEvent, rsvpOverall } from "@/modules/rsvp/counts";
import { Rsvp } from "@/modules/rsvp/model";
import { Wedding } from "@/modules/weddings/model";
import { deleteWedding } from "@/modules/weddings/service";
import { createMember, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

const TOKEN_CTX = (token: string) => ({ params: Promise.resolve({ token }) }) as never;
const ID_CTX = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
let ipCounter = 0;
/** A fresh address per call, so the per-address limits of one test never touch another's. */
const freshIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

async function makeEvent(weddingId: Types.ObjectId, name: string, date = "2027-02-11", extra = {}) {
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

/** A guest with a known token, so the tests can open the link without the member routes. */
async function makeGuest(
  weddingId: Types.ObjectId,
  name: string,
  eventIds: Types.ObjectId[] = [],
  extra = {},
) {
  const token = generateToken();
  const guest = await Guest.create({
    weddingId,
    name,
    eventIds,
    inviteTokenHash: hashToken(token),
    inviteTokenEnc: encryptToken(token),
    ...extra,
  });
  return { guest, token };
}

async function setup() {
  const { user, weddingId } = await createMember("admin");
  const haldi = await makeEvent(weddingId, "Haldi", "2027-02-11", {
    address: "12 Rose Street",
    mapLink: "https://maps.example.com/haldi",
    dressCode: "Yellow",
  });
  const sangeet = await makeEvent(weddingId, "Sangeet", "2027-02-12");
  const wedding = await makeEvent(weddingId, "Wedding", "2027-02-14");
  const lakshmi = await makeGuest(weddingId, "Lakshmi Rao", [haldi._id, wedding._id]);
  const meena = await makeGuest(weddingId, "Meena Reddy", [sangeet._id], {
    email: "meena@example.com",
  });
  return {
    userId: String(user._id),
    wid: String(weddingId),
    weddingId,
    haldi,
    sangeet,
    wedding,
    lakshmi,
    meena,
  };
}

const open = async (token: string, ip = freshIp()) =>
  getInvitationRoute(await request(`/api/public/invite/${token}`, { ip }), TOKEN_CTX(token));
const save = async (token: string, body: unknown, ip = freshIp(), origin?: string | null) =>
  saveRoute(
    await request(`/api/public/invite/${token}/rsvp`, {
      method: "POST",
      body,
      ip,
      ...(origin !== undefined ? { origin } : {}),
    }),
    TOKEN_CTX(token),
  );

describe("the guest's invitation (public GET)", () => {
  it("shows the couple and only the events this guest is invited to", async () => {
    const { lakshmi, meena, haldi, wedding } = await setup();
    const res = await open(lakshmi.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.guest).toEqual({ name: "Lakshmi Rao" });
    expect(body.wedding).toMatchObject({
      brideName: "Priya",
      groomName: "Ravi",
      weddingDate: "2027-02-14",
      rsvpCutoffDate: null,
      rsvpOpen: true,
    });
    expect(body.events.map((e: { id: string }) => e.id)).toEqual([
      String(haldi._id),
      String(wedding._id),
    ]);
    expect(body.events[0]).toMatchObject({
      name: "Haldi",
      date: "2027-02-11",
      time: "10:00",
      venueName: "Haldi Hall",
      address: "12 Rose Street",
      mapLink: "https://maps.example.com/haldi",
      dressCode: "Yellow",
      rsvp: null,
    });
    // Nothing about other guests, the guest list, money, ids of the wedding, or tokens.
    expect(text).not.toContain("Meena");
    expect(text).not.toContain("Sangeet");
    expect(text).not.toMatch(/inviteToken|tokenHash|email|phone|weddingId|createdBy/i);
    expect(JSON.parse(await (await open(meena.token)).text()).events).toHaveLength(1);
  });

  it("records the first open once and shows the guest's current answers", async () => {
    const { lakshmi, haldi } = await setup();
    expect((await Guest.findById(lakshmi.guest._id))!.inviteOpenedAt).toBeUndefined();
    await open(lakshmi.token);
    const first = (await Guest.findById(lakshmi.guest._id))!.inviteOpenedAt!;
    expect(first).toBeInstanceOf(Date);
    await save(lakshmi.token, {
      answers: [{ eventId: String(haldi._id), attending: true, headcount: 3 }],
    });
    await open(lakshmi.token);
    expect((await Guest.findById(lakshmi.guest._id))!.inviteOpenedAt!.getTime()).toBe(
      first.getTime(),
    );
    const body = JSON.parse(await (await open(lakshmi.token)).text());
    expect(body.events[0].rsvp).toEqual({ attending: true, headcount: 3 });
    expect(body.events[1].rsvp).toBeNull();
  });

  it("answers an unknown, malformed or empty token with the same 404", async () => {
    await setup();
    const bodies = new Set<string>();
    for (const token of [generateToken(), "short", "x".repeat(43), "%20", "a".repeat(200)]) {
      const res = await open(token);
      expect(res.status, token).toBe(404);
      bodies.add(await res.text());
    }
    expect([...bodies]).toEqual([
      '{"error":{"code":"LINK_NOT_FOUND","message":"This link isn\'t valid."}}',
    ]);
  });

  it("slows an address that keeps trying unknown links, but not normal use", async () => {
    const { lakshmi } = await setup();
    const ip = freshIp();
    // Normal use: many visits with a good link never count.
    for (let i = 0; i < 25; i++) expect((await open(lakshmi.token, ip)).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await open(generateToken(), ip)).status).toBe(404);
    const limited = await open(generateToken(), ip);
    expect(limited.status).toBe(429);
    expect(await RateLimit.countDocuments({ key: `invite-miss:ip:${ip}` })).toBe(20);
    // Another address is not affected.
    expect((await open(lakshmi.token, freshIp())).status).toBe(200);
  });
});

describe("saving RSVP answers (public POST)", () => {
  it("saves, changes and replaces answers, one document per guest and event", async () => {
    const { lakshmi, haldi, wedding } = await setup();
    const h = String(haldi._id);
    const w = String(wedding._id);
    const first = await save(lakshmi.token, {
      answers: [
        { eventId: h, attending: true, headcount: 3 },
        { eventId: w, attending: false, headcount: 5 },
      ],
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ saved: 2 });
    const stored = await Rsvp.find({ guestId: lakshmi.guest._id }).lean();
    expect(stored).toHaveLength(2);
    // Not attending is stored as 0, whatever was sent.
    expect(stored.find((r) => String(r.eventId) === w)).toMatchObject({
      attending: false,
      headcount: 0,
    });

    // Change one answer: the same document is updated, not added.
    await save(lakshmi.token, { answers: [{ eventId: w, attending: true, headcount: 2 }] });
    expect(await Rsvp.countDocuments({ guestId: lakshmi.guest._id })).toBe(2);
    expect(await Rsvp.findOne({ guestId: lakshmi.guest._id, eventId: haldi._id })).toMatchObject({
      headcount: 3,
    });
    expect(await Rsvp.findOne({ guestId: lakshmi.guest._id, eventId: wedding._id })).toMatchObject({
      attending: true,
      headcount: 2,
    });
    expect((await Rsvp.findOne({ guestId: lakshmi.guest._id }))!.weddingId).toEqual(
      lakshmi.guest.weddingId,
    );
  });

  it("refuses bad counts and shapes with 400 and saves nothing", async () => {
    const { lakshmi, haldi, wedding } = await setup();
    const h = String(haldi._id);
    const cases: unknown[] = [
      { answers: [{ eventId: h, attending: true }] }, // no headcount
      { answers: [{ eventId: h, attending: true, headcount: 0 }] },
      { answers: [{ eventId: h, attending: true, headcount: 21 }] },
      { answers: [{ eventId: h, attending: true, headcount: -1 }] },
      { answers: [{ eventId: h, attending: true, headcount: 1.5 }] },
      { answers: [{ eventId: h, attending: true, headcount: "3" }] },
      { answers: [{ eventId: h, attending: "yes", headcount: 2 }] },
      { answers: [{ eventId: "nope", attending: false }] },
      { answers: [] },
      {
        answers: [
          { eventId: h, attending: false },
          { eventId: h, attending: true, headcount: 2 },
        ],
      },
      {
        answers: [
          { eventId: String(wedding._id), attending: true, headcount: 2 },
          { nothing: true },
        ],
      },
      {},
    ];
    for (const body of cases) {
      const res = await save(lakshmi.token, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await Rsvp.countDocuments()).toBe(0);
    // The limits are 1 and 20 inclusive.
    for (const headcount of [1, 20]) {
      expect(
        (await save(lakshmi.token, { answers: [{ eventId: h, attending: true, headcount }] }))
          .status,
      ).toBe(200);
    }
  });

  it("refuses an event the guest is not invited to, and saves none of the answers", async () => {
    const { lakshmi, sangeet, haldi } = await setup();
    const res = await save(lakshmi.token, {
      answers: [
        { eventId: String(haldi._id), attending: true, headcount: 2 },
        { eventId: String(sangeet._id), attending: true, headcount: 2 },
      ],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("EVENT_NOT_INVITED");
    expect(await Rsvp.countDocuments()).toBe(0);
    // An event id that does not exist at all gives the same answer.
    const missing = await save(lakshmi.token, {
      answers: [{ eventId: new Types.ObjectId().toHexString(), attending: false }],
    });
    expect((await missing.json()).error.code).toBe("EVENT_NOT_INVITED");
  });

  it("stays open through the cut-off day and is read-only after it", async () => {
    const { lakshmi, haldi, weddingId } = await setup();
    const h = String(haldi._id);
    const answer = { answers: [{ eventId: h, attending: true, headcount: 2 }] };
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: todayIST() });
    expect((await save(lakshmi.token, answer)).status).toBe(200);
    expect(JSON.parse(await (await open(lakshmi.token)).text()).wedding.rsvpOpen).toBe(true);

    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2020-01-01" });
    const closed = await save(lakshmi.token, { answers: [{ eventId: h, attending: false }] });
    expect(closed.status).toBe(403);
    expect((await closed.json()).error.code).toBe("RSVP_CLOSED");
    // The last answers are still there, and the invitation says it is read-only.
    const body = JSON.parse(await (await open(lakshmi.token)).text());
    expect(body.wedding).toMatchObject({ rsvpCutoffDate: "2020-01-01", rsvpOpen: false });
    expect(body.events[0].rsvp).toEqual({ attending: true, headcount: 2 });
  });

  it("answers an unknown token with 404 and checks the Origin header", async () => {
    const { lakshmi, haldi } = await setup();
    const body = { answers: [{ eventId: String(haldi._id), attending: false }] };
    expect((await save(generateToken(), body)).status).toBe(404);
    expect((await save(lakshmi.token, body, freshIp(), "https://evil.example")).status).toBe(403);
    expect((await save(lakshmi.token, body, freshIp(), null)).status).toBe(403);
    expect(await Rsvp.countDocuments()).toBe(0);
  });

  it("allows 20 saves an hour per guest, and refused saves do not use them up", async () => {
    const { lakshmi, meena, haldi } = await setup();
    const good = { answers: [{ eventId: String(haldi._id), attending: false }] };
    // Bad answers first: they must not count.
    for (let i = 0; i < 5; i++) {
      expect(
        (await save(lakshmi.token, { answers: [{ eventId: String(haldi._id), attending: true }] }))
          .status,
      ).toBe(400);
    }
    for (let i = 0; i < 20; i++)
      expect((await save(lakshmi.token, good)).status, `save ${i}`).toBe(200);
    const limited = await save(lakshmi.token, good);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    // Another guest on another address is unaffected.
    expect(
      (
        await save(meena.token, {
          answers: [
            { eventId: String((await Event.findOne({ name: "Sangeet" }))!._id), attending: false },
          ],
        })
      ).status,
    ).toBe(200);
  });

  it("leaves no orphan answer when the guest is deleted at the same moment", async () => {
    for (let round = 0; round < 6; round++) {
      await emptyDb();
      const { lakshmi, haldi, wid } = await setup();
      const answer = { answers: [{ eventId: String(haldi._id), attending: true, headcount: 2 }] };
      await Promise.allSettled([
        save(lakshmi.token, answer),
        deleteGuest(wid, String(lakshmi.guest._id)),
      ]);
      expect(await Guest.countDocuments({ _id: lakshmi.guest._id })).toBe(0);
      expect(await Rsvp.countDocuments({ guestId: lakshmi.guest._id }), `round ${round}`).toBe(0);
    }
  }, 60_000);
});

describe("a guest's link (members)", () => {
  it("returns the current link, and a regenerated one replaces it at once", async () => {
    const { lakshmi, userId, haldi } = await setup();
    const link = await (
      await linkRoute(
        await request(`/api/guests/${lakshmi.guest._id}/link`, { userId }),
        ID_CTX(String(lakshmi.guest._id)),
      )
    ).json();
    expect(link.link).toBe(`http://localhost:3000/i/${lakshmi.token}`);

    await open(lakshmi.token);
    expect((await Guest.findById(lakshmi.guest._id))!.inviteOpenedAt).toBeDefined();
    await save(lakshmi.token, { answers: [{ eventId: String(haldi._id), attending: false }] });

    const res = await regenerateRoute(
      await request(`/api/guests/${lakshmi.guest._id}/regenerate-link`, { method: "POST", userId }),
      ID_CTX(String(lakshmi.guest._id)),
    );
    expect(res.status).toBe(200);
    const fresh = (await res.json()).link as string;
    const newToken = fresh.split("/i/")[1]!;
    expect(newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken).not.toBe(lakshmi.token);

    // The old link is dead, the new one works, and the guest's answers stay.
    expect((await open(lakshmi.token)).status).toBe(404);
    expect(
      (
        await save(lakshmi.token, {
          answers: [{ eventId: String(haldi._id), attending: true, headcount: 1 }],
        })
      ).status,
    ).toBe(404);
    const body = JSON.parse(await (await open(newToken)).text());
    expect(body.events[0].rsvp).toEqual({ attending: false, headcount: 0 });
    // What the database holds is a hash and an encrypted copy, never the token.
    const stored = await Guest.findById(lakshmi.guest._id).select("+inviteTokenEnc").lean();
    expect(JSON.stringify(stored)).not.toContain(newToken);
    // And the link route reads the new one.
    const again = await (
      await linkRoute(
        await request(`/api/guests/${lakshmi.guest._id}/link`, { userId }),
        ID_CTX(String(lakshmi.guest._id)),
      )
    ).json();
    expect(again.link).toBe(fresh);
  });

  it("needs a login, and another wedding's guest answers 404", async () => {
    const { lakshmi } = await setup();
    const id = String(lakshmi.guest._id);
    for (const [route, method] of [
      [linkRoute, "GET"],
      [regenerateRoute, "POST"],
    ] as const) {
      const suffix = method === "GET" ? "link" : "regenerate-link";
      expect(
        (await route(await request(`/api/guests/${id}/${suffix}`, { method }), ID_CTX(id))).status,
      ).toBe(401);
      const other = await createMember("manager");
      const res = await route(
        await request(`/api/guests/${id}/${suffix}`, { method, userId: String(other.user._id) }),
        ID_CTX(id),
      );
      expect(res.status).toBe(404);
    }
    // Nothing changed: the old link still works.
    expect((await open(lakshmi.token)).status).toBe(200);
  });
});

describe("headcounts", () => {
  it("counts guests and people per event, and each guest once overall", async () => {
    const { weddingId, haldi, sangeet, wedding, lakshmi, meena } = await setup();
    const anil = await makeGuest(weddingId, "Anil", [haldi._id, sangeet._id, wedding._id]);
    await makeGuest(weddingId, "No events");
    const h = String(haldi._id);
    const w = String(wedding._id);
    const s = String(sangeet._id);
    await save(lakshmi.token, {
      answers: [
        { eventId: h, attending: true, headcount: 3 },
        { eventId: w, attending: false },
      ],
    });
    await save(anil.token, {
      answers: [
        { eventId: h, attending: true, headcount: 2 },
        { eventId: s, attending: false },
      ],
    });
    void meena;

    const counts = await rsvpCountsByEvent(weddingId);
    expect(counts.get(h)).toEqual({
      invited: 2,
      attending: 2,
      declined: 0,
      notReplied: 0,
      headcount: 5,
    });
    expect(counts.get(s)).toEqual({
      invited: 2,
      attending: 0,
      declined: 1,
      notReplied: 1,
      headcount: 0,
    });
    expect(counts.get(w)).toEqual({
      invited: 2,
      attending: 0,
      declined: 1,
      notReplied: 1,
      headcount: 0,
    });
    const some = await rsvpCountsByEvent(weddingId, [sangeet._id, new Types.ObjectId()]);
    expect([...some.values()]).toHaveLength(2);
    expect((await rsvpCountsByEvent(weddingId, [])).size).toBe(0);

    // Lakshmi: yes + no = attending. Anil: yes + no = attending. Meena: nothing. The guest with no
    // events is not counted.
    expect(await rsvpOverall(weddingId)).toEqual({
      invited: 3,
      attending: 2,
      declined: 0,
      notReplied: 1,
    });
    // A guest who only declines is "declined".
    const nora = await makeGuest(weddingId, "Nora", [haldi._id]);
    await save(nora.token, { answers: [{ eventId: h, attending: false }] });
    expect(await rsvpOverall(weddingId)).toEqual({
      invited: 4,
      attending: 2,
      declined: 1,
      notReplied: 1,
    });
  });

  it("does not count another wedding's answers", async () => {
    const a = await setup();
    const b = await createMember("admin");
    const ev = await makeEvent(b.weddingId, "Other");
    const g = await makeGuest(b.weddingId, "Other guest", [ev._id]);
    await save(g.token, { answers: [{ eventId: String(ev._id), attending: true, headcount: 4 }] });
    expect(await rsvpOverall(a.weddingId)).toEqual({
      invited: 2,
      attending: 0,
      declined: 0,
      notReplied: 2,
    });
    expect((await rsvpCountsByEvent(a.weddingId)).get(String(ev._id))).toBeUndefined();
  });
});

describe("guest lists with answers", () => {
  it("shows each guest's answers and filters by reply, with paging", async () => {
    const { weddingId, wid, userId, haldi, wedding } = await setup();
    const h = String(haldi._id);
    const guests = [];
    for (let i = 1; i <= 5; i++)
      guests.push(await makeGuest(weddingId, `Guest ${i}`, [haldi._id, wedding._id]));
    await save(guests[0]!.token, { answers: [{ eventId: h, attending: true, headcount: 2 }] });
    await save(guests[1]!.token, {
      answers: [
        { eventId: h, attending: false },
        { eventId: String(wedding._id), attending: true, headcount: 1 },
      ],
    });
    await save(guests[2]!.token, { answers: [{ eventId: h, attending: true, headcount: 4 }] });

    const list = async (qs: string) => {
      const res = await listRoute(await request(`/api/guests?${qs}`, { userId }), {} as never);
      expect(res.status).toBe(200);
      return res.json();
    };
    const names = (r: { items: { name: string }[] }) => r.items.map((g) => g.name);
    expect(names(await list(`eventId=${h}&rsvpStatus=attending`))).toEqual(["Guest 1", "Guest 3"]);
    expect(names(await list(`eventId=${h}&rsvpStatus=declined`))).toEqual(["Guest 2"]);
    const notReplied = await list(`eventId=${h}&rsvpStatus=not_replied`);
    expect(names(notReplied)).toEqual(["Guest 4", "Guest 5", "Lakshmi Rao"]);
    expect(notReplied.total).toBe(3);

    // Paging through a filtered list stays right.
    const page1 = await list(`eventId=${h}&rsvpStatus=not_replied&limit=2`);
    expect(names(page1)).toEqual(["Guest 4", "Guest 5"]);
    const page2 = await list(
      `eventId=${h}&rsvpStatus=not_replied&limit=2&cursor=${page1.nextCursor}`,
    );
    expect(names(page2)).toEqual(["Lakshmi Rao"]);
    expect(page2.nextCursor).toBeUndefined();

    // Rows carry the counts and the answers.
    const all = await list("limit=100");
    const g2 = all.items.find((g: { name: string }) => g.name === "Guest 2");
    expect(g2.rsvp).toEqual({ replied: 2, of: 2 });
    expect(g2.answers).toEqual(
      expect.arrayContaining([
        { eventId: h, attending: false, headcount: 0 },
        { eventId: String(wedding._id), attending: true, headcount: 1 },
      ]),
    );
    expect(all.items.find((g: { name: string }) => g.name === "Guest 5").rsvp).toEqual({
      replied: 0,
      of: 2,
    });
    // The reply filter still needs an event.
    const bad = await listRoute(
      await request("/api/guests?rsvpStatus=attending", { userId }),
      {} as never,
    );
    expect(bad.status).toBe(400);

    // And the guest's own page lists the answers.
    const { rsvps } = await getGuest(wid, String(guests[1]!.guest._id));
    expect(rsvps).toHaveLength(2);
    // Service and route agree.
    expect(
      (await listGuests(wid, listGuestsQuery.parse({ eventId: h, rsvpStatus: "declined" }))).total,
    ).toBe(1);
  });
});

describe("clean-up", () => {
  it("deleting guests deletes their answers and takes them out of sends", async () => {
    const { weddingId, wid, userId, haldi, lakshmi, meena } = await setup();
    const h = String(haldi._id);
    await save(lakshmi.token, { answers: [{ eventId: h, attending: true, headcount: 2 }] });
    const send = await InvitationSend.create({
      weddingId,
      kind: "invite",
      eventIds: [haldi._id],
      guestIds: [lakshmi.guest._id, meena.guest._id],
      sentGuestIds: [lakshmi.guest._id],
      failedGuestIds: [meena.guest._id],
      startedBy: new Types.ObjectId(userId),
    });
    await deleteGuests(wid, [String(lakshmi.guest._id), String(meena.guest._id)]);
    expect(await Rsvp.countDocuments()).toBe(0);
    const after = (await InvitationSend.findById(send._id).lean())!;
    expect(after.guestIds).toEqual([]);
    expect(after.sentGuestIds).toEqual([]);
    expect(after.failedGuestIds).toEqual([]);
  });

  it("taking an event off a guest, or deleting the event, deletes the answers for it", async () => {
    const { weddingId, wid, haldi, wedding, lakshmi } = await setup();
    const h = String(haldi._id);
    const w = String(wedding._id);
    await save(lakshmi.token, {
      answers: [
        { eventId: h, attending: true, headcount: 2 },
        { eventId: w, attending: true, headcount: 2 },
      ],
    });
    const send = await InvitationSend.create({
      weddingId,
      kind: "invite",
      eventIds: [haldi._id, wedding._id],
      guestIds: [lakshmi.guest._id],
      startedBy: new Types.ObjectId(),
    });

    expect((await getDeleteImpact(wid, w)).rsvps).toBe(1);
    await deleteEvent(wid, w);
    expect(await Rsvp.countDocuments({ eventId: wedding._id })).toBe(0);
    expect(await Rsvp.countDocuments({ eventId: haldi._id })).toBe(1);
    expect((await InvitationSend.findById(send._id).lean())!.eventIds.map(String)).toEqual([h]);
    expect((await Guest.findById(lakshmi.guest._id).lean())!.eventIds.map(String)).toEqual([h]);

    // Editing the guest's events (here: removing Haldi) removes the answer for it too.
    const { updateGuest } = await import("@/modules/guests/service");
    await updateGuest(wid, String(lakshmi.guest._id), { eventIds: [] });
    expect(await Rsvp.countDocuments()).toBe(0);
  });

  it("deleting the wedding deletes its answers and sends, and nobody else's", async () => {
    const a = await setup();
    const b = await createMember("admin");
    const ev = await makeEvent(b.weddingId, "Other");
    const g = await makeGuest(b.weddingId, "Other guest", [ev._id]);
    await save(g.token, { answers: [{ eventId: String(ev._id), attending: true, headcount: 1 }] });
    await save(a.lakshmi.token, { answers: [{ eventId: String(a.haldi._id), attending: false }] });
    await InvitationSend.create({
      weddingId: a.weddingId,
      kind: "invite",
      eventIds: [a.haldi._id],
      guestIds: [a.lakshmi.guest._id],
      startedBy: new Types.ObjectId(),
    });
    await InvitationSend.create({
      weddingId: b.weddingId,
      kind: "invite",
      eventIds: [ev._id],
      guestIds: [g.guest._id],
      startedBy: new Types.ObjectId(),
    });

    const slug = (await Wedding.findById(a.weddingId).lean())!.slug;
    await deleteWedding(a.wid, slug);
    expect(await Rsvp.countDocuments({ weddingId: a.weddingId })).toBe(0);
    expect(await InvitationSend.countDocuments({ weddingId: a.weddingId })).toBe(0);
    expect(await Rsvp.countDocuments({ weddingId: b.weddingId })).toBe(1);
    expect(await InvitationSend.countDocuments({ weddingId: b.weddingId })).toBe(1);
  });
});

describe("headcounts in the Events list, the event page and the dashboard", () => {
  it("shows the same numbers everywhere they are used", async () => {
    const { userId, wid, weddingId, haldi, sangeet, lakshmi, meena } = await setup();
    const anil = await makeGuest(weddingId, "Anil", [haldi._id]);
    await save(lakshmi.token, {
      answers: [{ eventId: String(haldi._id), attending: true, headcount: 3 }],
    });
    await save(anil.token, { answers: [{ eventId: String(haldi._id), attending: false }] });
    void meena;

    const list = await listEvents(wid);
    const h = list.find((e) => e.name === "Haldi")!;
    expect(h.guestCount).toBe(3 - 1); // Lakshmi and Anil
    expect(h.rsvp).toEqual({ attending: 1, declined: 1, notReplied: 0, headcount: 3 });
    expect(list.find((e) => e.name === "Sangeet")!.rsvp).toEqual({
      attending: 0,
      declined: 0,
      notReplied: 1,
      headcount: 0,
    });
    const one = await getEvent(wid, String(haldi._id));
    expect(one.rsvp).toEqual({
      invited: 2,
      attending: 1,
      declined: 1,
      notReplied: 0,
      headcount: 3,
    });
    // The delete preview counts the real answers.
    expect((await getDeleteImpact(wid, String(haldi._id))).rsvps).toBe(2);
    expect((await getDeleteImpact(wid, String(sangeet._id))).rsvps).toBe(0);

    const dash = await getDashboard(wid, { userId, role: "admin" });
    expect(dash.rsvp.overall).toEqual({ invited: 3, attending: 1, declined: 1, notReplied: 1 });
    expect(dash.rsvp.byEvent.map((e) => [e.name, e.invited, e.attending, e.headcount])).toEqual([
      ["Haldi", 2, 1, 3],
      ["Sangeet", 1, 0, 0],
      ["Wedding", 1, 0, 0],
    ]);
  });

  it("the guest delete message includes the answers that go with the guest", () => {
    expect(deleteImpactLine(["Haldi"], 0)).toBe("Invited to 1 event (Haldi).");
    expect(deleteImpactLine(["Haldi", "Wedding"], 2)).toBe(
      "Invited to 2 events (Haldi, Wedding). Their 2 RSVPs will be deleted too.",
    );
    expect(deleteImpactLine(["Haldi"], 1)).toBe(
      "Invited to 1 event (Haldi). Their RSVP will be deleted too.",
    );
    expect(deleteImpactLine([], 0)).toBe("Not invited to any events yet.");
  });
});

describe("QA fixes", () => {
  it("a working link still opens after the address has made 20 bad lookups", async () => {
    const { lakshmi } = await setup();
    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await open(generateToken(), ip)).status).toBe(404);
    expect((await open(generateToken(), ip)).status).toBe(429);
    expect((await open(lakshmi.token, ip)).status).toBe(200);
    expect(
      (
        await save(
          lakshmi.token,
          {
            answers: [
              { eventId: String((await Event.findOne({ name: "Haldi" }))!._id), attending: false },
            ],
          },
          ip,
        )
      ).status,
    ).toBe(200);
  });

  it("refuses the same event twice, whatever the letter case of its id", async () => {
    const { lakshmi, haldi } = await setup();
    const id = String(haldi._id);
    const res = await save(lakshmi.token, {
      answers: [
        { eventId: id, attending: true, headcount: 1 },
        { eventId: id.toUpperCase(), attending: false },
      ],
    });
    expect(res.status).toBe(400);
    expect(await Rsvp.countDocuments()).toBe(0);
  });

  it("answers a closed form and a wrong event in plain words, not codes", async () => {
    const { lakshmi, sangeet, wid } = await setup();
    const wrong = await save(lakshmi.token, {
      answers: [{ eventId: String(sangeet._id), attending: false }],
    });
    expect((await wrong.json()).error.message).toBe("You are not invited to one of those events.");
    await Wedding.updateOne({ _id: wid }, { rsvpCutoffDate: "2020-01-01" });
    const closed = await save(lakshmi.token, {
      answers: [{ eventId: String(sangeet._id), attending: false }],
    });
    expect(closed.status).toBe(403);
    expect((await closed.json()).error.message).toBe(
      "Replies are closed. Please contact the couple.",
    );
  });
});

describe("QA review fixes", () => {
  it("keeps the real answer when giving back a save place fails", async () => {
    const { lakshmi, sangeet, wid } = await setup();
    await Wedding.updateOne({ _id: wid }, { rsvpCutoffDate: "2020-01-01" });
    const spy = vi.spyOn(RateLimit, "deleteOne").mockRejectedValue(new Error("db down"));
    try {
      const res = await save(lakshmi.token, {
        answers: [{ eventId: String(sangeet._id), attending: false }],
      });
      expect(res.status).toBe(403);
    } finally {
      spy.mockRestore();
    }
  });
});
