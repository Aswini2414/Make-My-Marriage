import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import mongoose, { Types } from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as impactRoute } from "@/app/api/events/[id]/delete-impact/route";
import { DELETE as deleteEventRoute } from "@/app/api/events/[id]/route";
import { GET as eventsListRoute } from "@/app/api/events/route";
import { POST as bulkDeleteRoute } from "@/app/api/guests/bulk-delete/route";
import { POST as bulkEventsRoute } from "@/app/api/guests/bulk-events/route";
import { GET as householdsRoute } from "@/app/api/guests/households/route";
import { POST as commitRoute } from "@/app/api/guests/import/commit/route";
import { POST as previewRoute } from "@/app/api/guests/import/preview/route";
import { GET as templateRoute } from "@/app/api/guests/import/template/route";
import { DELETE, GET, PATCH } from "@/app/api/guests/[id]/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/guests/route";
import { DELETE as deleteWeddingRoute } from "@/app/api/wedding/route";
import { getDashboard } from "@/modules/dashboard/service";
import { safeCell } from "@/lib/spreadsheet";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { Event } from "@/modules/events/model";
import { invitedCountsByEvent } from "@/modules/guests/counts";
import { Guest } from "@/modules/guests/model";
import { insertGuests } from "@/modules/guests/service";
import { normalizePhone } from "@/modules/guests/phone";
import { Wedding } from "@/modules/weddings/model";
import { APP, createMember, createUser, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

type Route = (req: never, ctx: never) => Promise<Response>;
const call = (route: Route, req: unknown, id?: string) =>
  route(req as never, { params: Promise.resolve({ id }) } as never);

async function errorOf(res: Response) {
  return (await res.json()).error as {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

async function setup() {
  const { user, weddingId } = await createMember("admin");
  return { userId: String(user._id), weddingId };
}

async function addEvent(weddingId: Types.ObjectId, name = "Sangeet", date = "2027-02-12") {
  return Event.create({
    weddingId,
    name,
    type: "Sangeet",
    date,
    time: "18:30",
    venueName: "Hall",
  });
}

async function postReq(userId: string, body: unknown) {
  return call(createRoute, await request("/api/guests", { method: "POST", userId, body }));
}
async function list(userId: string, query = "") {
  const res = await call(listRoute, await request(`/api/guests${query}`, { userId }));
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    items: { id: string; name: string; email?: string; phone?: string }[];
    nextCursor?: string;
    total: number;
  }>;
}
async function createOk(userId: string, body: unknown) {
  const res = await postReq(userId, body);
  expect(res.status).toBe(201);
  return (await res.json()).guest as { id: string; eventIds: string[] };
}
async function patch(userId: string, id: string, body: unknown) {
  return call(PATCH, await request(`/api/guests/${id}`, { method: "PATCH", userId, body }), id);
}

describe("create, get and update", () => {
  it("creates a guest with a trimmed name and returns it without any token", async () => {
    const { userId, weddingId } = await setup();
    const ev = await addEvent(weddingId);
    const res = await postReq(userId, {
      name: "  Lakshmi Rao ",
      email: " Lakshmi@Example.com ",
      phone: "98480-12345",
      relation: "Mother's cousin",
      household: "Rao family, Vizag",
      eventIds: [String(ev._id), String(ev._id)],
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    const { guest } = JSON.parse(text);
    expect(guest).toMatchObject({
      name: "Lakshmi Rao",
      email: "lakshmi@example.com",
      phone: "+91 98480 12345",
      relation: "Mother's cousin",
      household: "Rao family, Vizag",
      eventIds: [String(ev._id)],
      inviteStatus: "not_sent",
      rsvp: { replied: 0, of: 1 },
    });
    expect(text).not.toMatch(/inviteToken/i);
    // The token exists in the database: a hash and an encrypted copy.
    const stored = await Guest.findById(guest.id).select("+inviteTokenEnc").lean();
    expect(stored?.inviteTokenHash).toHaveLength(64);
    expect(stored?.inviteTokenEnc).toBeTruthy();
  });

  it("needs a name and rejects bad email, phone and long text, with a message per field", async () => {
    const { userId } = await setup();
    const res = await postReq(userId, {
      name: "   ",
      email: "not-an-email",
      phone: "call me",
      relation: "x".repeat(61),
      household: "x".repeat(81),
    });
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(err.fields ?? {}).sort()).toEqual(
      ["email", "household", "name", "phone", "relation"].sort(),
    );
    expect((await errorOf(await postReq(userId, {}))).fields?.name).toBeTruthy();
    expect((await errorOf(await postReq(userId, { name: "A\u0000B" }))).fields?.name).toBeTruthy();
  });

  it("treats empty optional fields as not set", async () => {
    const { userId } = await setup();
    const guest = await createOk(userId, { name: "Ravi", email: "", phone: " ", household: "" });
    const res = await call(GET, await request(`/api/guests/${guest.id}`, { userId }), guest.id);
    const body = await res.json();
    expect(body.guest.email).toBeUndefined();
    expect(body.guest.phone).toBeUndefined();
    expect(body.rsvps).toEqual([]);
  });

  it("updates fields, clears optional ones with null, and replaces the events", async () => {
    const { userId, weddingId } = await setup();
    const a = await addEvent(weddingId, "Haldi");
    const b = await addEvent(weddingId, "Mehendi");
    const guest = await createOk(userId, {
      name: "Sita",
      email: "sita@example.com",
      household: "Rao",
      eventIds: [String(a._id)],
    });
    const res = await patch(userId, guest.id, {
      name: "Sita Devi",
      email: null,
      household: "",
      eventIds: [String(b._id)],
    });
    expect(res.status).toBe(200);
    const { guest: updated } = await res.json();
    expect(updated.name).toBe("Sita Devi");
    expect(updated.email).toBeUndefined();
    expect(updated.household).toBeUndefined();
    expect(updated.eventIds).toEqual([String(b._id)]);
    expect((await patch(userId, guest.id, {})).status).toBe(400);
    expect((await patch(userId, guest.id, { name: "" })).status).toBe(400);
  });

  it("refuses events from another wedding and unknown events, the same way", async () => {
    const { userId } = await setup();
    const other = await createMember("admin");
    const foreign = await addEvent(other.weddingId, "Foreign");
    const first = await postReq(userId, { name: "A", eventIds: [String(foreign._id)] });
    const second = await postReq(userId, { name: "A", eventIds: [String(new Types.ObjectId())] });
    for (const res of [first, second]) {
      expect(res.status).toBe(400);
      const err = await errorOf(res);
      expect(err.fields?.eventIds).toBe("Choose events from this wedding.");
    }
    expect((await postReq(userId, { name: "A", eventIds: ["nope"] })).status).toBe(400);
    expect(await Guest.countDocuments()).toBe(0);
  });
});

describe("phone numbers", () => {
  it.each([
    ["9848012345", "+91 98480 12345"],
    ["98480 12345", "+91 98480 12345"],
    ["98480-12345", "+91 98480 12345"],
    ["+91 98480 12345", "+91 98480 12345"],
    ["+91-98480-12345", "+91 98480 12345"],
    ["(+91) 98480 12345", "+91 98480 12345"],
    ["919848012345", "+91 98480 12345"],
    ["09848012345", "+91 98480 12345"],
    ["+44 20 7946 0958", "+442079460958"],
    ["(020) 7946-0958", "02079460958"],
  ])("stores %s as %s", (typed, stored) => {
    expect(normalizePhone(typed)).toBe(stored);
  });

  it.each([
    "",
    "abc",
    "12345",
    "98480 12345 99999 123",
    "+91+98480",
    "98480*12345",
    "1234567890123456",
  ])("refuses %j", (typed) => {
    expect(normalizePhone(typed)).toBeNull();
  });
});

describe("duplicates are a warning, not an error", () => {
  it("answers 200 saved:false with the matches, and saves only when confirmed", async () => {
    const { userId } = await setup();
    const first = await createOk(userId, {
      name: "Lakshmi Rao",
      email: "l@example.com",
      phone: "9848012345",
    });
    const res = await postReq(userId, {
      name: "Lakshmi R",
      email: "L@example.com",
      phone: "+91 98480-12345",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      saved: false,
      duplicates: [
        {
          id: first.id,
          name: "Lakshmi Rao",
          email: "l@example.com",
          phone: "+91 98480 12345",
          matchedOn: ["email", "phone"],
        },
      ],
    });
    expect(await Guest.countDocuments()).toBe(1);

    const confirmed = await postReq(userId, {
      name: "Lakshmi R",
      email: "l@example.com",
      confirmDuplicates: true,
    });
    expect(confirmed.status).toBe(201);
    expect(await Guest.countDocuments()).toBe(2);
  });

  it("matches on phone alone, and ignores other weddings", async () => {
    const { userId } = await setup();
    const other = await createMember("admin");
    await Guest.create({
      weddingId: other.weddingId,
      name: "Elsewhere",
      email: "same@example.com",
      phone: "+91 98480 12345",
      inviteTokenHash: "a".repeat(64),
      inviteTokenEnc: "x",
    });
    expect(
      (await postReq(userId, { name: "A", email: "same@example.com", phone: "9848012345" })).status,
    ).toBe(201);
    const res = await postReq(userId, { name: "B", phone: "98480 12345" });
    expect(res.status).toBe(200);
    expect((await res.json()).duplicates[0].matchedOn).toEqual(["phone"]);
  });

  it("warns on update only for a changed detail, never matches the guest itself", async () => {
    const { userId } = await setup();
    const a = await createOk(userId, { name: "A", email: "a@example.com" });
    await createOk(userId, { name: "B", email: "b@example.com" });
    // Re-sending its own email is not a duplicate.
    expect((await patch(userId, a.id, { email: "a@example.com", name: "A2" })).status).toBe(200);
    const clash = await patch(userId, a.id, { email: "b@example.com" });
    expect(clash.status).toBe(200);
    expect((await clash.json()).saved).toBe(false);
    expect((await Guest.findById(a.id).lean())?.email).toBe("a@example.com");
    const ok = await patch(userId, a.id, { email: "b@example.com", confirmDuplicates: true });
    expect((await ok.json()).guest.email).toBe("b@example.com");
  });
});

describe("list, search, filter and pagination", () => {
  async function seed() {
    const { userId, weddingId } = await setup();
    const sangeet = await addEvent(weddingId, "Sangeet");
    const haldi = await addEvent(weddingId, "Haldi", "2027-02-11");
    const s = String(sangeet._id);
    const h = String(haldi._id);
    await createOk(userId, {
      name: "lakshmi Rao",
      email: "lak@example.com",
      phone: "9848012345",
      household: "Rao family",
      eventIds: [s, h],
    });
    await createOk(userId, {
      name: "Anil Kumar",
      email: "anil@x.org",
      household: "Kumar",
      eventIds: [s],
    });
    await createOk(userId, { name: "Zed (Z.) Smith", phone: "+44 20 7946 0958" });
    await createOk(userId, { name: "Bala", household: "Rao family", eventIds: [h] });
    return { userId, weddingId, s, h };
  }

  it("lists by name without regard to case, with a total", async () => {
    const { userId } = await seed();
    const all = await list(userId);
    expect(all.items.map((g) => g.name)).toEqual([
      "Anil Kumar",
      "Bala",
      "lakshmi Rao",
      "Zed (Z.) Smith",
    ]);
    expect(all.total).toBe(4);
    expect(all.nextCursor).toBeUndefined();
  });

  it("searches name, email, household and phone however the digits are spaced", async () => {
    const { userId } = await seed();
    const names = async (q: string) =>
      (await list(userId, `?q=${encodeURIComponent(q)}`)).items.map((g) => g.name);
    expect(await names("LAKSH")).toEqual(["lakshmi Rao"]);
    expect(await names("anil@x")).toEqual(["Anil Kumar"]);
    expect(await names("rao family")).toEqual(["Bala", "lakshmi Rao"]);
    expect(await names("98480")).toEqual(["lakshmi Rao"]);
    expect(await names("+91 98480 123")).toEqual(["lakshmi Rao"]);
    expect(await names("80 12")).toEqual(["lakshmi Rao"]);
    expect(await names("7946")).toEqual(["Zed (Z.) Smith"]);
    // Characters that mean something in a regular expression are plain text.
    expect(await names("(Z.)")).toEqual(["Zed (Z.) Smith"]);
    expect(await names(".*")).toEqual([]);
    expect(await names("[")).toEqual([]);
  });

  it("filters by event, household and RSVP status", async () => {
    const { userId, s, h } = await seed();
    const names = async (q: string) => (await list(userId, q)).items.map((g) => g.name);
    expect(await names(`?eventId=${s}`)).toEqual(["Anil Kumar", "lakshmi Rao"]);
    expect(await names(`?eventId=${h}&household=${encodeURIComponent("Rao family")}`)).toEqual([
      "Bala",
      "lakshmi Rao",
    ]);
    expect(await names(`?household=nobody`)).toEqual([]);
    // The filter is exact, like the household dropdown: "rao family" is not "Rao family".
    expect(await names(`?household=${encodeURIComponent("rao family")}`)).toEqual([]);
    // Nobody has replied yet (RSVPs arrive in Phase 4).
    expect(await names(`?eventId=${s}&rsvpStatus=not_replied`)).toEqual([
      "Anil Kumar",
      "lakshmi Rao",
    ]);
    expect(await names(`?eventId=${s}&rsvpStatus=attending`)).toEqual([]);
    expect(await names(`?eventId=${s}&rsvpStatus=declined`)).toEqual([]);
    expect(await names(`?inviteStatus=not_sent`)).toHaveLength(4);
    expect(await names(`?inviteStatus=sent`)).toEqual([]);
    expect(await names(`?inviteStatus=opened`)).toEqual([]);
  });

  it("answers 400 for an RSVP filter without an event, and for bad query values", async () => {
    const { userId } = await seed();
    const noEvent = await call(
      listRoute,
      await request("/api/guests?rsvpStatus=attending", { userId }),
    );
    expect(noEvent.status).toBe(400);
    expect((await errorOf(noEvent)).fields?.rsvpStatus).toBeTruthy();
    for (const q of [
      "?limit=0",
      "?limit=101",
      "?sort=age",
      "?inviteStatus=x",
      "?eventId=zzz",
      "?cursor=@@",
    ]) {
      expect((await call(listRoute, await request(`/api/guests${q}`, { userId }))).status).toBe(
        400,
      );
    }
  });

  it("pages with limit and cursor, and the pages add up to every guest once", async () => {
    const { userId } = await setup();
    for (let i = 0; i < 7; i++)
      await createOk(userId, { name: `Guest ${String(i).padStart(2, "0")}` });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await list(userId, `?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(page.total).toBe(7);
      seen.push(...page.items.map((g) => g.name));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(
      Array.from({ length: 7 }, (_, i) => `Guest ${String(i).padStart(2, "0")}`),
    );
    const newest = await list(userId, "?sort=-createdAt&limit=1");
    expect(newest.items[0]!.name).toBe("Guest 06");
  });

  it("lists households with their guest counts", async () => {
    const { userId } = await seed();
    const res = await call(householdsRoute, await request("/api/guests/households", { userId }));
    expect(await res.json()).toEqual({
      items: [
        { name: "Kumar", count: 1 },
        { name: "Rao family", count: 2 },
      ],
    });
  });
});

describe("bulk actions and delete", () => {
  it("adds and removes events for many guests, and changes nothing if one id is foreign", async () => {
    const { userId, weddingId } = await setup();
    const a = String((await addEvent(weddingId, "Haldi"))._id);
    const b = String((await addEvent(weddingId, "Mehendi"))._id);
    const g1 = await createOk(userId, { name: "One", eventIds: [a] });
    const g2 = await createOk(userId, { name: "Two" });
    const bulk = async (body: unknown) =>
      call(
        bulkEventsRoute,
        await request("/api/guests/bulk-events", { method: "POST", userId, body }),
      );

    const added = await bulk({ guestIds: [g1.id, g2.id], add: [b] });
    expect(await added.json()).toEqual({ updated: 2 });
    expect((await Guest.findById(g1.id).lean())?.eventIds.map(String).sort()).toEqual(
      [a, b].sort(),
    );
    expect((await Guest.findById(g2.id).lean())?.eventIds.map(String)).toEqual([b]);

    // Adding again does not duplicate, and removing works in the same call.
    await bulk({ guestIds: [g1.id, g1.id, g2.id], add: [b], remove: [a] });
    expect((await Guest.findById(g1.id).lean())?.eventIds.map(String)).toEqual([b]);

    const foreign = await createMember("admin");
    const stranger = await Guest.create({
      weddingId: foreign.weddingId,
      name: "Stranger",
      inviteTokenHash: "b".repeat(64),
      inviteTokenEnc: "x",
    });
    const res = await bulk({ guestIds: [g1.id, String(stranger._id)], remove: [b] });
    expect(res.status).toBe(404);
    expect((await Guest.findById(g1.id).lean())?.eventIds.map(String)).toEqual([b]);
    expect((await bulk({ guestIds: [g1.id] })).status).toBe(400);
    expect((await bulk({ guestIds: [], add: [a] })).status).toBe(400);
    expect((await bulk({ guestIds: Array(501).fill(g1.id), add: [a] })).status).toBe(400);
    const wrongEvent = await bulk({ guestIds: [g1.id], add: [String(new Types.ObjectId())] });
    expect(wrongEvent.status).toBe(400);
  });

  it("deletes one guest (204) and many (counts), 404 for a missing or foreign guest", async () => {
    const { userId } = await setup();
    const [a, b, c] = [
      await createOk(userId, { name: "A" }),
      await createOk(userId, { name: "B" }),
      await createOk(userId, { name: "C" }),
    ];
    const one = await call(
      DELETE,
      await request(`/api/guests/${a.id}`, { method: "DELETE", userId }),
      a.id,
    );
    expect(one.status).toBe(204);
    const again = await call(
      DELETE,
      await request(`/api/guests/${a.id}`, { method: "DELETE", userId }),
      a.id,
    );
    expect(again.status).toBe(404);

    const foreign = await createMember("admin");
    const stranger = await Guest.create({
      weddingId: foreign.weddingId,
      name: "Stranger",
      inviteTokenHash: "c".repeat(64),
      inviteTokenEnc: "x",
    });
    const bulk = async (guestIds: string[]) =>
      call(
        bulkDeleteRoute,
        await request("/api/guests/bulk-delete", { method: "POST", userId, body: { guestIds } }),
      );
    expect((await bulk([b.id, String(stranger._id)])).status).toBe(404);
    expect(await Guest.countDocuments()).toBe(3);
    const ok = await bulk([b.id, c.id, b.id]);
    expect(await ok.json()).toEqual({ deleted: 2 });
    expect(await Guest.countDocuments()).toBe(1);
  });
});

describe("access", () => {
  it("needs a session, lets a Manager do everything, and checks Origin", async () => {
    const { weddingId } = await setup();
    const manager = await createMember("manager", undefined, weddingId);
    const managerId = String(manager.user._id);
    expect((await call(listRoute, await request("/api/guests"))).status).toBe(401);
    expect((await postReq("", { name: "A" })).status).toBe(401);
    const created = await createOk(managerId, { name: "By manager" });
    expect((await patch(managerId, created.id, { name: "Renamed" })).status).toBe(200);
    const badOrigin = await call(
      createRoute,
      await request("/api/guests", {
        method: "POST",
        userId: managerId,
        body: { name: "X" },
        origin: "https://evil.example",
      }),
    );
    expect(badOrigin.status).toBe(403);
    expect((await errorOf(badOrigin)).code).toBe("FORBIDDEN_ORIGIN");
    const del = await call(
      DELETE,
      await request(`/api/guests/${created.id}`, { method: "DELETE", userId: managerId }),
      created.id,
    );
    expect(del.status).toBe(204);
  });

  it("answers 401 on every guest route without a session, and 403 NO_WORKSPACE without a wedding", async () => {
    const id = String(new Types.ObjectId());
    const routes: [Route, string, string][] = [
      [listRoute, "GET", "/api/guests"],
      [createRoute, "POST", "/api/guests"],
      [GET, "GET", `/api/guests/${id}`],
      [PATCH, "PATCH", `/api/guests/${id}`],
      [DELETE, "DELETE", `/api/guests/${id}`],
      [bulkEventsRoute, "POST", "/api/guests/bulk-events"],
      [bulkDeleteRoute, "POST", "/api/guests/bulk-delete"],
      [householdsRoute, "GET", "/api/guests/households"],
      [templateRoute, "GET", "/api/guests/import/template"],
      [previewRoute, "POST", "/api/guests/import/preview"],
      [commitRoute, "POST", "/api/guests/import/commit"],
    ];
    const loner = String((await createUser("Loner", "loner@example.com"))._id);
    for (const [route, method, path] of routes) {
      const body = method === "GET" || method === "DELETE" ? undefined : {};
      const anon = await call(route, await request(path, { method, body }), id);
      expect(anon.status, `${method} ${path}`).toBe(401);
      const noWedding = await call(route, await request(path, { method, body, userId: loner }), id);
      expect(noWedding.status, `${method} ${path}`).toBe(403);
      expect((await errorOf(noWedding)).code).toBe("NO_WORKSPACE");
    }
  });

  it("answers 404 for another wedding's guest on get, update and delete, like a missing one", async () => {
    const { userId } = await setup();
    const other = await createMember("admin");
    const theirs = await Guest.create({
      weddingId: other.weddingId,
      name: "Theirs",
      inviteTokenHash: "d".repeat(64),
      inviteTokenEnc: "x",
    });
    const id = String(theirs._id);
    for (const target of [id, String(new Types.ObjectId()), "not-an-id"]) {
      expect(
        (await call(GET, await request(`/api/guests/${target}`, { userId }), target)).status,
      ).toBe(404);
      expect((await patch(userId, target, { name: "Hacked" })).status).toBe(404);
      expect(
        (
          await call(
            DELETE,
            await request(`/api/guests/${target}`, { method: "DELETE", userId }),
            target,
          )
        ).status,
      ).toBe(404);
    }
    expect((await Guest.findById(id).lean())?.name).toBe("Theirs");
    expect((await list(userId)).total).toBe(0);
  });
});

// ---- import ----

async function xlsx(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Guests");
  ws.addRows(rows);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const csv = (text: string) => new TextEncoder().encode(text);

async function upload(
  userId: string,
  name: string,
  bytes: Uint8Array,
  route: Route = previewRoute,
) {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name));
  const token = await signSession(userId);
  return call(
    route,
    new NextRequest(`${APP}/api/guests/import/preview`, {
      method: "POST",
      headers: { origin: APP, cookie: `${SESSION_COOKIE}=${token}` },
      body: form,
    }),
  );
}

type Preview = {
  rows: {
    row: number;
    data: Record<string, unknown>;
    errors: Record<string, string>;
    duplicate?: { kind: string; row?: number; guestId?: string; name?: string };
  }[];
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
};

describe("import preview", () => {
  const HEADER = "name,email,phone,relation,household,events\n";

  it("reports every kind of row error and saves nothing", async () => {
    const { userId, weddingId } = await setup();
    await addEvent(weddingId, "Sangeet");
    const file = csv(
      HEADER +
        'Lakshmi Rao,lak@example.com,98480 12345,Aunt,"Rao family, Vizag",Sangeet\n' +
        ",x@example.com,,,,\n" +
        "Bad Email,not-an-email,,,,\n" +
        "Bad Phone,,12ab,,,\n" +
        "Unknown Event,,,,,Sangit; sangeet\n" +
        `Too Long,,,${"r".repeat(61)},${"h".repeat(81)},\n` +
        `${"n".repeat(101)},,,,,\n`,
    );
    const res = await upload(userId, "guests.csv", file);
    expect(res.status).toBe(200);
    const p = (await res.json()) as Preview;
    expect(p.total).toBe(7);
    expect(p.valid).toBe(1);
    expect(p.invalid).toBe(6);
    expect(p.rows[0]!).toMatchObject({
      row: 2,
      errors: {},
      data: { name: "Lakshmi Rao", phone: "+91 98480 12345", household: "Rao family, Vizag" },
    });
    expect(p.rows[0]!.data.eventIds).toHaveLength(1);
    expect(p.rows[1]!.errors.name).toBeTruthy();
    expect(p.rows[2]!.errors.email).toBe("Enter a valid email address.");
    expect(p.rows[3]!.errors.phone).toBeTruthy();
    expect(p.rows[4]!.errors.events).toBe('No event called "Sangit".');
    expect(Object.keys(p.rows[5]!.errors).sort()).toEqual(["household", "relation"]);
    expect(p.rows[6]!.errors.name).toContain("100");
    expect(await Guest.countDocuments()).toBe(0);
  });

  it("finds duplicates inside the file and against saved guests", async () => {
    const { userId } = await setup();
    const saved = await createOk(userId, {
      name: "Saved",
      email: "saved@example.com",
      phone: "9000000001",
    });
    const file = csv(
      HEADER +
        "First,dup@example.com,,,,\n" +
        "Second,DUP@example.com,,,,\n" +
        "Third,,9000000002,,,\n" +
        "Fourth,,+91 90000-00002,,,\n" +
        "Same as saved,saved@example.com,,,,\n" +
        "Phone of saved,,90000 00001,,,\n",
    );
    const p = (await (await upload(userId, "g.csv", file)).json()) as Preview;
    expect(p.duplicates).toBe(4);
    expect(p.valid).toBe(6);
    expect(p.rows[0]!.duplicate).toBeUndefined();
    expect(p.rows[1]!.duplicate).toEqual({ kind: "file", row: 2 });
    expect(p.rows[2]!.duplicate).toBeUndefined();
    expect(p.rows[3]!.duplicate).toEqual({ kind: "file", row: 4 });
    expect(p.rows[4]!.duplicate).toEqual({ kind: "existing", guestId: saved.id, name: "Saved" });
    expect(p.rows[5]!.duplicate?.kind).toBe("existing");
  });

  it("reads an Excel file, with numbers as phones and any column order", async () => {
    const { userId, weddingId } = await setup();
    await addEvent(weddingId, "Haldi");
    const file = await xlsx([
      ["Events", "NAME", "Phone", "notes (ignored)"],
      ["haldi", "Sita", 9848012345, "x"],
      ["", "Ravi", "", ""],
    ]);
    const res = await upload(userId, "guests.xlsx", file);
    expect(res.status).toBe(200);
    const p = (await res.json()) as Preview;
    expect(p.valid).toBe(2);
    expect(p.rows[0]!.data).toMatchObject({ name: "Sita", phone: "+91 98480 12345" });
    expect(p.rows[0]!.data.eventIds).toHaveLength(1);
    expect(p.rows[1]!.row).toBe(3);
  });

  it("keeps formula-looking cells as plain text and never evaluates them", async () => {
    const { userId } = await setup();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Guests");
    ws.addRow(["name", "relation"]);
    ws.addRow(["=1+1", "@SUM(A1)"]);
    ws.addRow(["Calc", { formula: "1+1" }]);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const p = (await (await upload(userId, "f.xlsx", bytes)).json()) as Preview;
    expect(p.rows[0]!.data.name).toBe("=1+1");
    expect(p.rows[0]!.data.relation).toBe("@SUM(A1)");
    // A formula cell is read as the text Excel saved with it. This file saved none, and 1+1 was not run.
    expect(p.rows[1]!.data.relation).toBeUndefined();

    const text = csv('name,relation\n"=HYPERLINK(""http://evil"")","-2+3"\n');
    const q = (await (await upload(userId, "f.csv", text)).json()) as Preview;
    expect(q.rows[0]!.data).toMatchObject({ name: '=HYPERLINK("http://evil")', relation: "-2+3" });
    expect(await Guest.countDocuments()).toBe(0);
  });

  it("refuses a missing name column, an empty file and too many rows", async () => {
    const { userId } = await setup();
    const noName = await upload(userId, "a.csv", csv("email,phone\na@b.co,\n"));
    expect(noName.status).toBe(400);
    expect((await errorOf(noName)).code).toBe("IMPORT_FILE_INVALID");
    const empty = await upload(userId, "a.csv", csv("\n\n"));
    expect((await errorOf(empty)).code).toBe("IMPORT_FILE_INVALID");

    const many = (n: number) =>
      csv(`name\n${Array.from({ length: n }, (_, i) => `G${i}`).join("\n")}\n`);
    const ok = await upload(userId, "ok.csv", many(2000));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Preview).total).toBe(2000);
    const over = await upload(userId, "over.csv", many(2001));
    expect(over.status).toBe(400);
    expect((await errorOf(over)).code).toBe("IMPORT_FILE_INVALID");
    const overX = await upload(
      userId,
      "over.xlsx",
      await xlsx([["name"], ...Array.from({ length: 2001 }, (_, i) => [`G${i}`])]),
    );
    expect((await errorOf(overX)).code).toBe("IMPORT_FILE_INVALID");
  });

  it("reads Excel's own CSV flavours: Windows-1252, semicolons, and says why when it cannot", async () => {
    const { userId, weddingId } = await setup();
    // "CSV (Comma delimited)" from Excel on Windows is Windows-1252: e-acute 0xe9, u-umlaut 0xfc, right quote 0x92.
    const ansi = new Uint8Array([
      ...csv("name,relation\nJos"),
      0xe9,
      ...csv(" M"),
      0xfc,
      ...csv("ller,Mother"),
      0x92,
      ...csv("s cousin\n"),
    ]);
    const a = (await (await upload(userId, "ansi.csv", ansi)).json()) as Preview;
    expect(a.valid).toBe(1);
    expect(a.rows[0]!.data).toMatchObject({ name: "José Müller", relation: "Mother’s cousin" });

    // A UTF-8 BOM plus one stray Windows-1252 byte must not hide the "name" header.
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...csv("name\nCaf"), 0xe9, ...csv("\n")]);
    const bp = (await (await upload(userId, "bom.csv", bom)).json()) as Preview;
    expect(bp.rows[0]!.data.name).toBe("Café");

    // Regional Excel puts ";" between columns. ";" inside the events cell must keep working.
    await addEvent(weddingId, "Sangeet");
    const semi = csv('name;email;events\nSemi Guest;semi@example.com;"Sangeet; Sangeet"\n');
    const s = (await (await upload(userId, "semi.csv", semi)).json()) as Preview;
    expect(s.valid).toBe(1);
    expect(s.rows[0]!.data).toMatchObject({ name: "Semi Guest", email: "semi@example.com" });
    expect(s.rows[0]!.data.eventIds).toHaveLength(1);

    // A comma file with ";" inside events is still a comma file.
    const comma = csv('name,events\nA B,"Sangeet; Sangeet"\n');
    const c = (await (await upload(userId, "c.csv", comma)).json()) as Preview;
    expect(c.rows[0]!.data.eventIds).toHaveLength(1);

    // UTF-16 and old .xls get a message that says what to do.
    const utf16 = new Uint8Array([0xff, 0xfe, 0x6e, 0x00, 0x61, 0x00]);
    expect((await errorOf(await upload(userId, "u.csv", utf16))).message).toContain("CSV UTF-8");
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    expect((await errorOf(await upload(userId, "o.xls", ole))).message).toContain(".xlsx");
    expect((await errorOf(await upload(userId, "o.xlsx", ole))).message).toContain(".xlsx");
  });

  it("refuses files over 2 MB with 413, while they stream", async () => {
    const { userId } = await setup();
    const big = new Uint8Array(2 * 1024 * 1024 + 10).fill(65);
    const res = await upload(userId, "big.csv", big);
    expect(res.status).toBe(413);
    const err = await errorOf(res);
    expect(err.code).toBe("FILE_TOO_LARGE");
    expect(err.message).toContain("2 MB");
  });

  it("never trusts the extension: renamed zips, programs, PDFs, old .xls and other types are refused", async () => {
    const { userId } = await setup();
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const cases: [string, Uint8Array][] = [
      ["a.csv", zip],
      ["a.csv", new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])],
      ["a.csv", csv("%PDF-1.4\nname\n")],
      ["a.csv", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])],
      ["a.csv", new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x01, 0x02, 0x03])],
      ["a.xlsx", csv("name\nSita\n")],
      ["a.xlsx", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
      ["a.xls", await xlsx([["name"], ["Sita"]])],
      ["a.txt", csv("name\nSita\n")],
      ["a.csv.exe", csv("name\nSita\n")],
      ["noextension", csv("name\nSita\n")],
    ];
    for (const [name, bytes] of cases) {
      const res = await upload(userId, name, bytes);
      expect(res.status, name).toBe(400);
      expect((await errorOf(res)).code, name).toBe("FILE_TYPE_NOT_ALLOWED");
    }
  });

  it("refuses a corrupt .xlsx, and a zip that would unpack to a huge size", async () => {
    const { userId } = await setup();
    const real = await xlsx([["name"], ["Sita"]]);
    const corrupt = real.slice(0, Math.floor(real.length / 2));
    expect((await errorOf(await upload(userId, "c.xlsx", corrupt))).code).toBe(
      "IMPORT_FILE_INVALID",
    );

    // Raise the unpacked size in the directory entries to 1 GB. The guard reads those before opening.
    const forged = real.slice();
    const view = new DataView(forged.buffer);
    let patched = 0;
    for (let i = 0; i < forged.length - 46; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 1_000_000_000, true);
        patched++;
      }
    }
    expect(patched).toBeGreaterThan(0);
    const res = await upload(userId, "bomb.xlsx", forged);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("IMPORT_FILE_INVALID");
  });

  it("needs a file field, a session, and says 404-free for other weddings' events", async () => {
    const { userId } = await setup();
    const other = await createMember("admin");
    await addEvent(other.weddingId, "Foreign");
    const p = (await (
      await upload(userId, "a.csv", csv("name,events\nA,Foreign\n"))
    ).json()) as Preview;
    expect(p.rows[0]!.errors.events).toBe('No event called "Foreign".');
    const noFile = await call(
      previewRoute,
      new NextRequest(`${APP}/api/guests/import/preview`, {
        method: "POST",
        headers: {
          origin: APP,
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${await signSession(userId)}`,
        },
        body: "{}",
      }),
    );
    expect(noFile.status).toBe(400);
    const anon = await call(
      previewRoute,
      new NextRequest(`${APP}/api/guests/import/preview`, {
        method: "POST",
        headers: { origin: APP },
      }),
    );
    expect(anon.status).toBe(401);
  });
});

describe("import commit", () => {
  async function commit(userId: string, body: unknown) {
    return call(
      commitRoute,
      await request("/api/guests/import/commit", { method: "POST", userId, body }),
    );
  }

  it("saves only valid rows, counting the rest as invalid", async () => {
    const { userId, weddingId } = await setup();
    const ev = String((await addEvent(weddingId))._id);
    const foreign = String((await addEvent((await createMember("admin")).weddingId, "F"))._id);
    const res = await commit(userId, {
      onDuplicate: "skip",
      rows: [
        { name: "Good", email: "g@example.com", phone: "98480 12345", eventIds: [ev] },
        { name: "", email: "x@example.com" },
        { name: "Bad Email", email: "nope" },
        { name: "Foreign Event", eventIds: [foreign] },
        "not an object",
        { name: "Also Good", household: "Rao" },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 2, skipped: 0, invalid: 4 });
    const saved = await Guest.find().select("+inviteTokenEnc").sort({ name: 1 }).lean();
    expect(saved.map((g) => g.name)).toEqual(["Also Good", "Good"]);
    expect(saved[1]!.phone).toBe("+91 98480 12345");
    expect(saved[1]!.eventIds.map(String)).toEqual([ev]);
    // Each imported guest has their own invitation token.
    expect(new Set(saved.map((g) => g.inviteTokenHash)).size).toBe(2);
    expect(saved.every((g) => g.inviteTokenEnc)).toBe(true);
  });

  it("skips duplicates when asked, and adds them when asked", async () => {
    const { userId } = await setup();
    await createOk(userId, { name: "Existing", email: "e@example.com" });
    const rows = [
      { name: "New", email: "n@example.com" },
      { name: "Dup of existing", email: "E@example.com" },
      { name: "New again", email: "n@example.com" },
      { name: "Phone one", phone: "9111111111" },
    ];
    const skip = await (await commit(userId, { onDuplicate: "skip", rows })).json();
    expect(skip).toEqual({ created: 2, skipped: 2, invalid: 0 });
    expect(await Guest.countDocuments()).toBe(3);

    const add = await (await commit(userId, { onDuplicate: "add", rows })).json();
    expect(add).toEqual({ created: 4, skipped: 0, invalid: 0 });
    expect(await Guest.countDocuments()).toBe(7);
  });

  it("validates its own input, and works for a Manager but not across weddings", async () => {
    const { userId, weddingId } = await setup();
    expect((await commit(userId, { rows: [], onDuplicate: "update" })).status).toBe(400);
    expect((await commit(userId, { rows: "x", onDuplicate: "skip" })).status).toBe(400);
    expect((await commit(userId, { onDuplicate: "skip" })).status).toBe(400);
    expect(
      (await commit(userId, { rows: Array(2001).fill({ name: "A" }), onDuplicate: "add" })).status,
    ).toBe(400);
    expect((await commit("", { rows: [], onDuplicate: "skip" })).status).toBe(401);
    const manager = await createMember("manager", undefined, weddingId);
    const res = await commit(String(manager.user._id), {
      rows: [{ name: "By manager" }],
      onDuplicate: "skip",
    });
    expect(await res.json()).toEqual({ created: 1, skipped: 0, invalid: 0 });
    const other = await setup();
    expect((await list(other.userId)).total).toBe(0);
  });

  it("round-trips a preview into a commit", async () => {
    const { userId, weddingId } = await setup();
    await addEvent(weddingId, "Sangeet");
    const file = csv("name,email,phone,events\nSita,sita@example.com,9848012345,Sangeet\n,bad,,\n");
    const p = (await (await upload(userId, "g.csv", file)).json()) as Preview;
    const rows = p.rows.filter((r) => Object.keys(r.errors).length === 0).map((r) => r.data);
    const done = await (await commit(userId, { rows, onDuplicate: "skip" })).json();
    expect(done).toEqual({ created: 1, skipped: 0, invalid: 0 });
    expect((await list(userId)).items[0]).toMatchObject({ name: "Sita", phone: "+91 98480 12345" });
  });
});

describe("import template and safe cells", () => {
  async function download(userId: string, format?: string) {
    return call(
      templateRoute,
      await request(`/api/guests/import/template${format ? `?format=${format}` : ""}`, { userId }),
    );
  }

  it("downloads a CSV with the six columns and an example that imports as it stands", async () => {
    const { userId, weddingId } = await setup();
    await addEvent(weddingId, "Haldi", "2027-02-11");
    await addEvent(weddingId, "Sangeet", "2027-02-12");
    const res = await download(userId);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("guest-import-template.csv");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text.replace("﻿", "").split("\r\n")[0]).toBe(
      "name,email,phone,relation,household,events",
    );
    const p = (await (await upload(userId, "t.csv", bytes)).json()) as Preview;
    expect(p.total).toBe(1);
    expect(p.valid).toBe(1);
    expect(p.rows[0]!.data.eventIds).toHaveLength(2);
  });

  it("downloads an XLSX that reads back with the same header", async () => {
    const { userId } = await setup();
    const res = await download(userId, "xlsx");
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const header = wb.worksheets[0]!.getRow(1).values as string[];
    expect(header.slice(1)).toEqual(["name", "email", "phone", "relation", "household", "events"]);
    expect(((await (await upload(userId, "t.xlsx", bytes)).json()) as Preview).valid).toBe(1);
    expect((await download(userId, "pdf")).status).toBe(400);
    expect((await call(templateRoute, await request("/api/guests/import/template"))).status).toBe(
      401,
    );
  });

  it("safeCell neutralises a leading =, +, -, @, tab or carriage return, and nothing else", () => {
    for (const t of ["=1+1", "+91 98480 12345", "-5", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(safeCell(t)).toBe(`'${t}`);
    }
    for (const t of ["Lakshmi", "a=b", "", "98480 12345", "'already"]) expect(safeCell(t)).toBe(t);
  });
});

describe("events, counts and wedding delete", () => {
  it("counts guests invited per event in one function, zero for an event with nobody", async () => {
    const { userId, weddingId } = await setup();
    const a = await addEvent(weddingId, "Haldi");
    const b = await addEvent(weddingId, "Mehendi");
    const c = await addEvent(weddingId, "Empty");
    await createOk(userId, { name: "One", eventIds: [String(a._id), String(b._id)] });
    await createOk(userId, { name: "Two", eventIds: [String(a._id)] });
    const other = await createMember("admin");
    await Guest.create({
      weddingId: other.weddingId,
      name: "Elsewhere",
      eventIds: [a._id],
      inviteTokenHash: "e".repeat(64),
      inviteTokenEnc: "x",
    });

    const counts = await invitedCountsByEvent(weddingId, [a._id, b._id, c._id]);
    expect([
      counts.get(String(a._id)),
      counts.get(String(b._id)),
      counts.get(String(c._id)),
    ]).toEqual([2, 1, 0]);
    expect((await invitedCountsByEvent(weddingId)).size).toBe(2);
    expect((await invitedCountsByEvent(weddingId, [])).size).toBe(0);

    // The events list shows the real "N invited".
    const events = (
      await (await call(eventsListRoute, await request("/api/events", { userId }))).json()
    ).items;
    const byName = Object.fromEntries(
      events.map((e: { name: string; guestCount: number }) => [e.name, e.guestCount]),
    );
    expect(byName).toEqual({ Haldi: 2, Mehendi: 1, Empty: 0 });
    // So does the dashboard's upcoming-events card.
    const dash = await getDashboard(String(weddingId), { userId, role: "admin" });
    expect(dash.upcomingEvents.map((e) => e.guestCount).sort()).toEqual([0, 1, 2]);
    expect(dash.setup.guests).toBe(true);
  });

  it("shows the real guest count in the delete preview, and deleting an event unlinks its guests", async () => {
    const { userId, weddingId } = await setup();
    const a = await addEvent(weddingId, "Haldi");
    const b = await addEvent(weddingId, "Mehendi");
    const g1 = await createOk(userId, { name: "One", eventIds: [String(a._id), String(b._id)] });
    const g2 = await createOk(userId, { name: "Two", eventIds: [String(a._id)] });
    const id = String(a._id);

    const impact = await call(
      impactRoute,
      await request(`/api/events/${id}/delete-impact`, { userId }),
      id,
    );
    expect((await impact.json()).guests).toBe(2);

    const del = await call(
      deleteEventRoute,
      await request(`/api/events/${id}`, { method: "DELETE", userId }),
      id,
    );
    expect(del.status).toBe(204);
    // The guests stay; only the link to the event goes.
    expect(await Guest.countDocuments()).toBe(2);
    expect((await Guest.findById(g1.id).lean())?.eventIds.map(String)).toEqual([String(b._id)]);
    expect((await Guest.findById(g2.id).lean())?.eventIds).toEqual([]);
    expect(await Guest.countDocuments({ eventIds: a._id })).toBe(0);
  });

  it("deleting the wedding deletes its guests and no one else's", async () => {
    const { userId, weddingId } = await setup();
    const other = await createMember("admin");
    await createOk(userId, { name: "Mine" });
    await createOk(userId, { name: "Mine too" });
    const theirs = await Guest.create({
      weddingId: other.weddingId,
      name: "Theirs",
      inviteTokenHash: "f".repeat(64),
      inviteTokenEnc: "x",
    });
    const slug = (await Wedding.findById(weddingId).lean())!.slug;
    const res = await deleteWeddingRoute(
      await request("/api/wedding", { method: "DELETE", userId, body: { confirmSlug: slug } }),
      {} as never,
    );
    expect(res.status).toBe(204);
    expect(await Guest.countDocuments({ weddingId })).toBe(0);
    expect(await Guest.findById(theirs._id).lean()).not.toBeNull();
  });
});

// ---- review fixes ----

/** A one-entry zip whose directory declares `declared` bytes unpacked, whatever the data really is. */
function zipDeclaring(data: Buffer, declared: number) {
  const body = deflateRawSync(data);
  const name = Buffer.from("xl/sheet.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(declared, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // local header at the start
  const directoryAt = local.length + name.length + body.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(directoryAt, 16);
  return new Uint8Array(Buffer.concat([local, name, body, central, name, end]));
}

describe("review fixes", () => {
  it("stops a zip that lies about its unpacked size", async () => {
    const { userId } = await setup();
    // 60 MB of zeros packs to about 60 KB; the directory claims 100 bytes.
    const bomb = zipDeclaring(Buffer.alloc(60 * 1024 * 1024), 100);
    expect(bomb.length).toBeLessThan(200_000);
    const res = await upload(userId, "lie.xlsx", bomb);
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("IMPORT_FILE_INVALID");
    expect(err.message).toContain("too large once opened");
    expect(await Guest.countDocuments()).toBe(0);
  });

  it("paging by cursor does not repeat or skip guests when the list changes meanwhile", async () => {
    const { userId } = await setup();
    const made: Record<string, string> = {};
    for (const n of ["A", "B", "C", "D", "E", "F"])
      made[n] = (await createOk(userId, { name: n })).id;
    const first = await list(userId, "?limit=3");
    expect(first.items.map((g) => g.name)).toEqual(["A", "B", "C"]);
    // Someone adds a guest before the page boundary and deletes one that was already shown.
    await createOk(userId, { name: "AA" });
    await Guest.deleteOne({ _id: made.A });
    const second = await list(userId, `?limit=3&cursor=${first.nextCursor}`);
    expect(second.items.map((g) => g.name)).toEqual(["D", "E", "F"]);
    expect(second.nextCursor).toBeUndefined();
    // Same names are ordered by id, and the newest-first order pages the same way.
    const newest1 = await list(userId, "?sort=-createdAt&limit=2");
    const newest2 = await list(userId, `?sort=-createdAt&limit=2&cursor=${newest1.nextCursor}`);
    expect([...newest1.items, ...newest2.items].map((g) => g.name)).toEqual(["AA", "F", "E", "D"]);
    // A cursor from one sort order is refused in the other, and so is nonsense.
    const wrong = await call(
      listRoute,
      await request(`/api/guests?cursor=${first.nextCursor}&sort=-createdAt`, { userId }),
    );
    expect(wrong.status).toBe(400);
  });

  it("adding guests while their event is deleted never leaves a dangling event id", async () => {
    const { userId, weddingId } = await setup();
    for (let round = 0; round < 8; round++) {
      const ev = await addEvent(weddingId, `Race ${round}`);
      const results = await Promise.all([
        ...Array.from({ length: 3 }, (_, i) =>
          postReq(userId, { name: `R${round}-${i}`, eventIds: [String(ev._id)] }),
        ),
        call(
          deleteEventRoute,
          await request(`/api/events/${ev._id}`, { method: "DELETE", userId }),
          String(ev._id),
        ),
      ]);
      for (const r of results.slice(0, 3)) expect([201, 400]).toContain(r.status);
      expect(results[3]!.status).toBe(204);
      // Whatever order they ran in, no guest points at the deleted event.
      expect(await Guest.countDocuments({ eventIds: ev._id })).toBe(0);
    }
  }, 60_000);

  it("an import is all or nothing, even when an event vanishes before it is saved", async () => {
    const { weddingId } = await setup();
    const ev = await addEvent(weddingId, "Gone");
    await Event.deleteOne({ _id: ev._id });
    await expect(
      insertGuests(String(weddingId), [
        { name: "One", eventIds: [] },
        { name: "Two", eventIds: [ev._id] },
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await Guest.countDocuments()).toBe(0);
  });

  it("the name sort is served by the collated index, with no in-memory sort", async () => {
    const { userId, weddingId } = await setup();
    await createOk(userId, { name: "Bala" });
    await Guest.createIndexes();
    const plan = await Guest.find({ weddingId })
      .sort({ name: 1, _id: 1 })
      .collation({ locale: "en", strength: 2 })
      .limit(11)
      .explain("queryPlanner");
    // Only the plan MongoDB chose counts (rejected plans may well contain a SORT).
    const winner = JSON.stringify(
      (plan as unknown as { queryPlanner: { winningPlan: unknown } }).queryPlanner.winningPlan,
    );
    expect(winner).toContain("weddingId_1_name_1__id_1_en");
    expect(winner).not.toContain('"stage":"SORT"');
  });
});
