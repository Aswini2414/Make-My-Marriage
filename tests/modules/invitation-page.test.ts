import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getInvitationRoute } from "@/app/api/public/invite/[token]/route";
import { POST as openedRoute } from "@/app/api/public/invite/[token]/opened/route";
import { POST as saveRoute } from "@/app/api/public/invite/[token]/rsvp/route";
import { clientIpFromHeaders } from "@/lib/api";
import { formatDate, todayIST } from "@/lib/dates";
import { ApiError } from "@/lib/errors";
import { encryptToken, generateToken, hashToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { Guest } from "@/modules/guests/model";
import {
  chooseAnswer,
  clampHeadcount,
  closedLine,
  draftFromEvents,
  emptyDraft,
  eventCountText,
  firstName,
  type InvitationData,
  lastSavedDate,
  mapHref,
  pageStateFor,
  peopleText,
  reconcileDraft,
  recapLine,
  saveErrorMessage,
  setHeadcount,
  shouldRefresh,
  stepHeadcount,
  toPayload,
  unanswered,
  type InvitationEvent,
  showIncompleteBanner,
  showsNotValidPage,
} from "@/modules/rsvp/page-state";
import { getInvitation } from "@/modules/rsvp/service";
import { Wedding } from "@/modules/weddings/model";
import nextConfig from "../../next.config";
import { createMember, emptyDb, request, resetDb } from "../helpers";

// The guest page at /i/<token> (4B): its logic, the screen each kind of guest gets, and what the
// page may show. The page itself calls getInvitation(); these tests use the real service, the real
// routes and a real database, and mock nothing.

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

const TOKEN_CTX = (token: string) => ({ params: Promise.resolve({ token }) }) as never;
let ipCounter = 0;
const freshIp = () => `10.2.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

async function makeEvent(weddingId: Types.ObjectId, name: string, date: string, extra = {}) {
  return Event.create({
    weddingId,
    name,
    type: name === "Muhurtham" ? "Wedding" : name,
    date,
    time: "10:00",
    venueName: `${name} Hall`,
    ...extra,
  });
}

async function makeGuest(
  weddingId: Types.ObjectId,
  name: string,
  eventIds: Types.ObjectId[],
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

const load = (token: string, ip = freshIp()) => getInvitation(token, ip, { markOpened: false });
const post = async (token: string, body: unknown) =>
  saveRoute(
    await request(`/api/public/invite/${token}/rsvp`, { method: "POST", body, ip: freshIp() }),
    TOKEN_CTX(token),
  );

async function seed() {
  const { weddingId } = await createMember("admin");
  await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2099-01-01" });
  const haldi = await makeEvent(weddingId, "Haldi", "2027-02-13", {
    address: "Plot 42",
    mapLink: "https://maps.example.com/haldi",
    dressCode: "Yellow",
  });
  const muhurtham = await makeEvent(weddingId, "Muhurtham", "2027-02-14");
  const reception = await makeEvent(weddingId, "Reception", "2027-02-15");
  const all = [haldi._id, muhurtham._id, reception._id];
  return { weddingId, haldi, muhurtham, reception, all };
}

const ev = (id: string, rsvp: InvitationData["events"][number]["rsvp"] = null) =>
  ({
    id,
    name: `Event ${id}`,
    type: "Wedding",
    date: "2027-02-14",
    time: "10:00",
    venueName: "Hall",
    rsvp,
  }) as InvitationData["events"][number];

describe("form logic", () => {
  it("starts with nothing chosen and lists the unanswered events in order", () => {
    const events = [ev("a"), ev("b"), ev("c")];
    const draft = emptyDraft(events);
    expect(unanswered(events, draft)).toEqual(["a", "b", "c"]);
    const some = chooseAnswer(draft, "b", false);
    expect(unanswered(events, some)).toEqual(["a", "c"]);
  });

  it("choosing Attending starts at 1 person and keeps a count the guest already set", () => {
    let d = chooseAnswer(emptyDraft([ev("a")]), "a", true);
    expect(d.a).toEqual({ attending: true, headcount: 1 });
    d = setHeadcount(d, "a", 4, 20);
    d = chooseAnswer(d, "a", true);
    expect(d.a).toEqual({ attending: true, headcount: 4 });
    d = chooseAnswer(d, "a", false);
    expect(d.a).toEqual({ attending: false, headcount: 0 });
    // Back to Attending after Not attending: a fresh 1.
    expect(chooseAnswer(d, "a", true).a).toEqual({ attending: true, headcount: 1 });
  });

  it("keeps the stepper between 1 and the limit from the API", () => {
    expect(stepHeadcount(1, -1, 20)).toBe(1);
    expect(stepHeadcount(20, 1, 20)).toBe(20);
    expect(stepHeadcount(5, 1, 20)).toBe(6);
    expect(stepHeadcount(5, -1, 20)).toBe(4);
    expect(stepHeadcount(3, 1, 3)).toBe(3);
    expect(clampHeadcount(0, 20)).toBe(1);
    expect(clampHeadcount(-4, 20)).toBe(1);
    expect(clampHeadcount(99, 20)).toBe(20);
    expect(clampHeadcount(2.9, 20)).toBe(2);
    expect(clampHeadcount(Number.NaN, 20)).toBe(1);
    // A count cannot be set for an event the guest is not attending.
    const d = chooseAnswer(emptyDraft([ev("a")]), "a", false);
    expect(setHeadcount(d, "a", 5, 20)).toBe(d);
  });

  it("builds the answer payload: a head count only when attending", () => {
    const events = [ev("a"), ev("b"), ev("c")];
    let d = chooseAnswer(emptyDraft(events), "a", true);
    d = setHeadcount(d, "a", 3, 20);
    d = chooseAnswer(d, "b", false);
    expect(toPayload(events, d)).toEqual({
      answers: [
        { eventId: "a", attending: true, headcount: 3 },
        { eventId: "b", attending: false },
      ],
    });
    // Events removed from the page are left out of the payload.
    expect(toPayload([ev("a")], d).answers).toHaveLength(1);
  });

  it("words the recap and the closed list", () => {
    expect(recapLine({ attending: true, headcount: 2 })).toBe("Attending, 2 people");
    expect(recapLine({ attending: true, headcount: 1 })).toBe("Attending, 1 person");
    expect(recapLine({ attending: false, headcount: 0 })).toBe("Not attending");
    expect(closedLine({ attending: true, headcount: 4 })).toBe("Attending (4 people)");
    expect(closedLine({ attending: false, headcount: 0 })).toBe("Not attending");
    expect(eventCountText(3)).toBe("3 events");
    expect(eventCountText(1)).toBe("1 event");
    expect(firstName("Meena Reddy")).toBe("Meena");
    expect(firstName("  Meena  ")).toBe("Meena");
    expect(firstName("Dr. Rao")).toBe("Dr. Rao");
    expect(firstName("The Sharma Family")).toBe("The Sharma Family");
  });

  it("uses a map link only when it is https", () => {
    expect(mapHref("https://maps.example.com/x")).toBe("https://maps.example.com/x");
    expect(mapHref("javascript:alert(1)")).toBeUndefined();
    expect(mapHref("http://maps.example.com")).toBeUndefined();
    expect(mapHref("not a url")).toBeUndefined();
    expect(mapHref(undefined)).toBeUndefined();
  });

  it("explains each failed save in plain words, and refreshes when the invitation changed", () => {
    expect(saveErrorMessage("RATE_LIMITED")).toBe(
      "Too many attempts. Please try again in a few minutes.",
    );
    expect(saveErrorMessage("RSVP_CLOSED")).toMatch(/closed/);
    expect(saveErrorMessage("EVENT_NOT_INVITED")).toMatch(/changed/);
    expect(saveErrorMessage(undefined)).toMatch(/could not save/);
    for (const code of ["RATE_LIMITED", "RSVP_CLOSED", "EVENT_NOT_INVITED", "BAD", undefined]) {
      // Never mention the code or the link.
      expect(saveErrorMessage(code)).not.toMatch(/[A-Z_]{6,}|\/i\//);
    }
    expect(shouldRefresh("EVENT_NOT_INVITED")).toBe(true);
    expect(shouldRefresh("RSVP_CLOSED")).toBe(true);
    expect(shouldRefresh("RATE_LIMITED")).toBe(false);
  });

  it("shows the 'Incomplete reply' banner only while an event is still unanswered", () => {
    const events = [{ id: "a" }, { id: "b" }] as InvitationEvent[];
    const yes = { attending: true, headcount: 1 };
    expect(showIncompleteBanner(events, { a: yes, b: null }, false)).toBe(false); // not tried yet
    expect(showIncompleteBanner(events, { a: yes, b: null }, true)).toBe(true);
    expect(showIncompleteBanner(events, { a: yes, b: yes }, true)).toBe(false); // all answered
    expect(showIncompleteBanner(events, { a: null, b: null }, true)).toBe(true); // answer removed
  });

  it("answers 'not valid' for a bad link and for an address that made too many bad lookups", () => {
    expect(showsNotValidPage("LINK_NOT_FOUND")).toBe(true);
    expect(showsNotValidPage("RATE_LIMITED")).toBe(true);
    expect(showsNotValidPage("SERVER_ERROR")).toBe(false);
    expect(showsNotValidPage(undefined)).toBe(false);
  });

  it("keeps typed answers when the invitation changes: new events start empty, gone ones drop", () => {
    const ev = (id: string) => ({ id }) as InvitationEvent;
    const yes = { attending: true, headcount: 3 };
    const no = { attending: false, headcount: 0 };
    const before = { a: yes, b: no, c: null };
    // b is deleted, d is new.
    expect(reconcileDraft([ev("a"), ev("c"), ev("d")], before)).toEqual({
      a: yes,
      c: null,
      d: null,
    });
    // Nothing changed: same answers.
    expect(reconcileDraft([ev("a"), ev("b"), ev("c")], before)).toEqual(before);
  });

  it("words people counts the same everywhere", () => {
    expect(peopleText(1)).toBe("1 person");
    expect(peopleText(2)).toBe("2 people");
    expect(recapLine({ attending: true, headcount: 1 })).toBe("Attending, 1 person");
    expect(closedLine({ attending: true, headcount: 4 })).toBe("Attending (4 people)");
  });

  it("shows the day of the latest save in India time", () => {
    const at = (iso: string) => ev("x", { attending: true, headcount: 1, respondedAt: iso });
    expect(lastSavedDate([ev("a")])).toBeNull();
    // 20:00 UTC on 1 Jan is already 2 January in India.
    expect(lastSavedDate([at("2027-01-01T20:00:00.000Z")])).toBe("2 January 2027");
    expect(
      lastSavedDate([at("2027-01-01T01:00:00.000Z"), at("2027-01-05T01:00:00.000Z"), ev("b")]),
    ).toBe("5 January 2027");
  });

  it("reads the caller's address from a headers object like the routes do", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }))).toBe(
      "1.2.3.4",
    );
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("which screen each guest gets (real data)", () => {
  it("first visit: the form, nothing recorded as opened by the server render", async () => {
    const { weddingId, all } = await seed();
    const { guest, token } = await makeGuest(weddingId, "Meena Reddy", all);
    const data = await load(token);
    expect(pageStateFor(data)).toBe("invite");
    expect(data.events).toHaveLength(3);
    expect(data.events[0]).toMatchObject({ name: "Haldi", type: "Haldi" });
    expect(data.events[1]).toMatchObject({ name: "Muhurtham", type: "Wedding" });
    expect(data.maxHeadcount).toBe(20);
    // The server render does not mark the invitation opened (a mail scanner may fetch it)...
    expect((await Guest.findById(guest._id))!.inviteOpenedAt).toBeUndefined();
    // ...the browser's call to the API does.
    const res = await getInvitationRoute(
      await request(`/api/public/invite/${token}`, { ip: freshIp() }),
      TOKEN_CTX(token),
    );
    expect(res.status).toBe(200);
    expect((await Guest.findById(guest._id))!.inviteOpenedAt).toBeInstanceOf(Date);
  });

  it("the 'opened' call is small, safe to repeat, and refuses what the other public calls refuse", async () => {
    const { weddingId, all } = await seed();
    const { guest, token } = await makeGuest(weddingId, "Anil Rao", all);
    expect((await load(token)).opened).toBe(false); // the server render reports it truthfully
    const call = async (t: string, ip = freshIp(), origin?: string | null) =>
      openedRoute(
        await request(`/api/public/invite/${t}/opened`, {
          method: "POST",
          ip,
          ...(origin !== undefined ? { origin } : {}),
        }),
        TOKEN_CTX(t),
      );
    const res = await call(token);
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const first = (await Guest.findById(guest._id))!.inviteOpenedAt;
    expect(first).toBeInstanceOf(Date);
    expect((await load(token)).opened).toBe(true);
    // Repeating it changes nothing.
    expect((await call(token)).status).toBe(204);
    expect((await Guest.findById(guest._id))!.inviteOpenedAt).toEqual(first);
    // An unknown link, and a call from another site or with no Origin, are refused.
    expect((await call(generateToken())).status).toBe(404);
    expect((await call(token, freshIp(), "https://evil.example")).status).toBe(403);
    expect((await call(token, freshIp(), null)).status).toBe(403);
  });

  it("partly replied: still the form, with the saved answers filled in", async () => {
    const { weddingId, all, haldi } = await seed();
    const { token } = await makeGuest(weddingId, "Suresh Kumar", all);
    await post(token, { answers: [{ eventId: String(haldi._id), attending: true, headcount: 3 }] });
    const data = await load(token);
    expect(pageStateFor(data)).toBe("invite");
    const draft = draftFromEvents(data.events);
    expect(draft[String(haldi._id)]).toEqual({ attending: true, headcount: 3 });
    expect(unanswered(data.events, draft)).toHaveLength(2);
  });

  it("fully replied: the thank-you recap first, from the saved answers", async () => {
    const { weddingId, all, haldi, muhurtham, reception } = await seed();
    const { token } = await makeGuest(weddingId, "Lakshmi Rao", all);
    const events = (await load(token)).events;
    let draft = emptyDraft(events);
    draft = chooseAnswer(draft, String(haldi._id), true);
    draft = chooseAnswer(draft, String(muhurtham._id), true);
    draft = setHeadcount(draft, String(muhurtham._id), 4, 20);
    draft = chooseAnswer(draft, String(reception._id), false);
    const body = toPayload(events, draft);
    const res = await post(token, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 3 });
    const data = await load(token);
    expect(pageStateFor(data)).toBe("thanks");
    expect(data.events.map((e) => (e.rsvp ? recapLine(e.rsvp) : null))).toEqual([
      "Attending, 1 person",
      "Attending, 4 people",
      "Not attending",
    ]);
    expect(lastSavedDate(data.events)).toBe(formatDate(todayIST()));
    // Changing one answer keeps the page on the recap.
    const again = await post(token, {
      answers: [{ eventId: String(reception._id), attending: true, headcount: 2 }],
    });
    expect(again.status).toBe(200);
    const changed = await load(token);
    expect(pageStateFor(changed)).toBe("thanks");
    expect(recapLine(changed.events[2]!.rsvp!)).toBe("Attending, 2 people");
  });

  it("after the cut-off: read-only, with the reply if there is one and without if not", async () => {
    const { weddingId, all, haldi } = await seed();
    const replied = await makeGuest(weddingId, "Lakshmi Rao", all);
    const silent = await makeGuest(weddingId, "Anita Sharma", all);
    await post(replied.token, {
      answers: [{ eventId: String(haldi._id), attending: true, headcount: 2 }],
    });
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2020-01-01" });

    const withReply = await load(replied.token);
    expect(pageStateFor(withReply)).toBe("closed");
    expect(withReply.wedding.rsvpCutoffDate).toBe("2020-01-01");
    expect(withReply.events.filter((e) => e.rsvp)).toHaveLength(1);

    const without = await load(silent.token);
    expect(pageStateFor(without)).toBe("closed");
    expect(without.events.filter((e) => e.rsvp)).toHaveLength(0);

    // Saving is refused, and nothing is written.
    const res = await post(silent.token, {
      answers: [{ eventId: String(haldi._id), attending: false }],
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("RSVP_CLOSED");
    expect((await load(silent.token)).events.filter((e) => e.rsvp)).toHaveLength(0);
  });

  it("the cut-off day itself is still open", async () => {
    const { weddingId, all } = await seed();
    const { token } = await makeGuest(weddingId, "Meena Reddy", all);
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: todayIST() });
    expect(pageStateFor(await load(token))).toBe("invite");
  });

  it("an unknown, malformed or empty link all give the same not-found error", async () => {
    await seed();
    const errors = await Promise.all(
      [generateToken(), "short", "x".repeat(43), "../../etc/passwd", "a".repeat(200)].map((t) =>
        load(t).then(
          () => null,
          (e: unknown) => e,
        ),
      ),
    );
    for (const e of errors) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("LINK_NOT_FOUND");
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).message).toBe((errors[0] as ApiError).message);
    }
  });

  it("a replaced link stops working and the new one shows the same guest", async () => {
    const { weddingId, all } = await seed();
    const { guest, token } = await makeGuest(weddingId, "Meena Reddy", all);
    const next = generateToken();
    await Guest.updateOne(
      { _id: guest._id },
      { inviteTokenHash: hashToken(next), inviteTokenEnc: encryptToken(next) },
    );
    await expect(load(token)).rejects.toMatchObject({ code: "LINK_NOT_FOUND" });
    expect((await load(next)).guest.name).toBe("Meena Reddy");
  });

  it("a guest sees only their own events and nothing of another wedding or guest", async () => {
    const { weddingId, all, haldi } = await seed();
    const mine = await makeGuest(weddingId, "Meena Reddy", [haldi._id]);
    await makeGuest(weddingId, "Secret Neighbour", all, {
      email: "secret@neighbour.example",
      phone: "9876543210",
    });
    // Another wedding with its own guest and event.
    const other = await createMember("admin");
    const nikah = await makeEvent(other.weddingId, "Nikah", "2027-03-01");
    const stranger = await makeGuest(other.weddingId, "Zoya Khan", [nikah._id]);

    const data = await load(mine.token);
    expect(data.events.map((e) => e.name)).toEqual(["Haldi"]);
    const text = JSON.stringify(data);
    for (const leak of [
      "Secret Neighbour",
      "secret@neighbour",
      "9876543210",
      "Nikah",
      "Zoya",
      "Muhurtham",
      "Reception",
      mine.token,
      String(weddingId),
      "inviteToken",
      "tokenHash",
      "createdBy",
      "Paise",
    ]) {
      expect(text).not.toContain(leak);
    }
    // The other wedding's token opens only that wedding.
    const theirs = await load(stranger.token);
    expect(theirs.events.map((e) => e.name)).toEqual(["Nikah"]);
    expect(JSON.stringify(theirs)).not.toContain("Haldi");
    // And its event cannot be answered with a token from this wedding.
    const res = await post(mine.token, {
      answers: [{ eventId: String(nikah._id), attending: true, headcount: 1 }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("EVENT_NOT_INVITED");
  });

  it("an event deleted while the page is open: the save fails whole and the page can re-read", async () => {
    const { weddingId, all, haldi, muhurtham } = await seed();
    const { token } = await makeGuest(weddingId, "Meena Reddy", all);
    expect((await load(token)).events).toHaveLength(3);
    await Event.deleteOne({ _id: muhurtham._id });
    await Guest.updateMany({ weddingId }, { $pull: { eventIds: muhurtham._id } });
    const res = await post(token, {
      answers: [
        { eventId: String(haldi._id), attending: true, headcount: 1 },
        { eventId: String(muhurtham._id), attending: true, headcount: 1 },
      ],
    });
    expect(res.status).toBe(400);
    const code = (await res.json()).error.code;
    expect(shouldRefresh(code)).toBe(true);
    // Nothing was kept, and the page's next read no longer lists the deleted event.
    const after = await load(token);
    expect(after.events.map((e) => e.name)).toEqual(["Haldi", "Reception"]);
    expect(after.events.filter((e) => e.rsvp)).toHaveLength(0);
  });
});

describe("headers for the guest page", () => {
  it("is never indexed, cached or passed on as a referrer", async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.filter((r) => r.source === "/i/:path*");
    expect(rule).toHaveLength(1);
    const h = Object.fromEntries(rule[0]!.headers.map((x) => [x.key, x.value]));
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Cache-Control"]).toBe("no-store");
    expect(h["X-Robots-Tag"]).toMatch(/noindex/);
  });
});
