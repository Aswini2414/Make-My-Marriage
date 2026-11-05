import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteWeddingRoute } from "@/app/api/wedding/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/events/route";
import {
  DELETE as deleteRoute,
  GET as getRoute,
  PATCH as patchRoute,
} from "@/app/api/events/[id]/route";
import { GET as impactRoute } from "@/app/api/events/[id]/delete-impact/route";
import { GET as typesRoute, POST as addTypeRoute } from "@/app/api/events/types/route";
import { generateToken, hashToken, encryptToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { QrCode } from "@/modules/qr/model";
import { Wedding } from "@/modules/weddings/model";
import { createMember, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

type Route = (req: never, ctx: never) => Promise<Response>;
const call = (route: Route, req: unknown, id?: string) =>
  route(req as never, { params: Promise.resolve({ id }) } as never);

const sangeet = {
  name: "Sangeet Night",
  type: "Sangeet",
  date: "2027-02-12",
  time: "18:30",
  venueName: "Novotel Varun Beach",
};

async function errorOf(res: Response) {
  return (await res.json()).error as {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

async function admin() {
  const { user, weddingId } = await createMember("admin");
  return { userId: String(user._id), weddingId };
}

const create = async (userId: string, body: unknown) =>
  call(createRoute, await request("/api/events", { method: "POST", userId, body }));
const list = async (userId: string) =>
  (await call(listRoute, await request("/api/events", { userId }))).json();
const createOk = async (userId: string, body: unknown) => {
  const res = await create(userId, body);
  expect(res.status).toBe(201);
  return (await res.json()).event as { id: string };
};

describe("create and list", () => {
  it("creates an event and returns it with an id", async () => {
    const { userId } = await admin();
    const res = await create(userId, {
      ...sangeet,
      address: "Beach Road",
      mapLink: "https://maps.google.com/?q=novotel",
      dressCode: "Indo-western",
      notes: "Dinner after 8\nParking at the back",
      youtubeLink: "https://youtu.be/abc123",
    });
    expect(res.status).toBe(201);
    const { event } = await res.json();
    expect(event).toMatchObject({ ...sangeet, address: "Beach Road", guestCount: 0 });
    expect(event.id).toMatch(/^[0-9a-f]{24}$/);
    expect(event.youtubeLink).toBe("https://youtu.be/abc123");
  });

  it("leaves out optional fields that were not set", async () => {
    const { userId } = await admin();
    const { event } = await (await create(userId, { ...sangeet, address: "", notes: "  " })).json();
    expect(event).not.toHaveProperty("address");
    expect(event).not.toHaveProperty("notes");
    expect(event).not.toHaveProperty("mapLink");
  });

  it("lists by date, then by time on the same day", async () => {
    const { userId } = await admin();
    await createOk(userId, {
      ...sangeet,
      name: "Reception",
      type: "Reception",
      date: "2027-02-14",
      time: "19:00",
    });
    await createOk(userId, {
      ...sangeet,
      name: "Muhurtham",
      type: "Wedding (Muhurtham)",
      date: "2027-02-14",
      time: "07:30",
    });
    await createOk(userId, {
      ...sangeet,
      name: "Haldi",
      type: "Haldi",
      date: "2027-02-11",
      time: "09:00",
    });
    await createOk(userId, {
      ...sangeet,
      name: "Lunch",
      type: "Reception",
      date: "2027-02-14",
      time: "12:00",
    });
    const { items } = await list(userId);
    expect(items.map((e: { name: string }) => e.name)).toEqual([
      "Haldi",
      "Muhurtham",
      "Lunch",
      "Reception",
    ]);
  });

  it("a Manager can create, edit and delete events", async () => {
    const { weddingId } = await admin();
    const { user } = await createMember("manager", undefined, weddingId);
    const userId = String(user._id);
    const { id } = await createOk(userId, sangeet);
    const patched = await call(
      patchRoute,
      await request(`/api/events/${id}`, { method: "PATCH", userId, body: { venueName: "Home" } }),
      id,
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).event.venueName).toBe("Home");
    const deleted = await call(
      deleteRoute,
      await request(`/api/events/${id}`, { method: "DELETE", userId }),
      id,
    );
    expect(deleted.status).toBe(204);
  });
});

describe("validation", () => {
  const bad = async (body: Record<string, unknown>, field: string) => {
    const { userId } = await admin();
    const res = await create(userId, body);
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.fields).toHaveProperty(field);
  };

  it("needs name, type, date, time and venue", async () => {
    const { userId } = await admin();
    const err = await errorOf(await create(userId, {}));
    expect(Object.keys(err.fields ?? {}).sort()).toEqual([
      "date",
      "name",
      "time",
      "type",
      "venueName",
    ]);
  });

  it("rejects a bad time", async () => {
    await bad({ ...sangeet, time: "25:00" }, "time");
    await bad({ ...sangeet, time: "6:30" }, "time");
  });

  it("rejects dates that are not real", async () => {
    await bad({ ...sangeet, date: "2027-02-30" }, "date");
    await bad({ ...sangeet, date: "12/02/2027" }, "date");
  });

  it("rejects map links that are not https", async () => {
    await bad({ ...sangeet, mapLink: "http://maps.google.com/x" }, "mapLink");
    await bad({ ...sangeet, mapLink: "javascript:alert(1)" }, "mapLink");
    await bad({ ...sangeet, mapLink: "not a url" }, "mapLink");
  });

  it("refuses links URL() reads as https but without ://, as 400 and not a server error", async () => {
    await bad({ ...sangeet, mapLink: "https:maps.google.com" }, "mapLink");
    await bad({ ...sangeet, mapLink: "https:/maps.google.com" }, "mapLink");
    await bad({ ...sangeet, youtubeLink: "https:youtu.be/abc" }, "youtubeLink");
  });

  it("accepts an upper-case scheme on create and update", async () => {
    const { userId } = await admin();
    const res = await create(userId, {
      ...sangeet,
      mapLink: "HTTPS://maps.google.com/x",
      youtubeLink: "HTTPS://youtu.be/abc",
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()).event as { id: string };
    const patched = await call(
      patchRoute,
      await request(`/api/events/${id}`, {
        method: "PATCH",
        userId,
        body: { mapLink: "Https://maps.google.com/y" },
      }),
      id,
    );
    expect(patched.status).toBe(200);
  });

  it("rejects live links that are not YouTube", async () => {
    await bad({ ...sangeet, youtubeLink: "https://vimeo.com/123" }, "youtubeLink");
    await bad({ ...sangeet, youtubeLink: "https://youtube.com.evil.example/x" }, "youtubeLink");
    await bad({ ...sangeet, youtubeLink: "http://youtube.com/watch?v=1" }, "youtubeLink");
  });

  it("accepts YouTube hosts", async () => {
    const { userId } = await admin();
    for (const url of [
      "https://www.youtube.com/live/abc",
      "https://youtube.com/watch?v=abc",
      "https://m.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
    ]) {
      expect((await create(userId, { ...sangeet, youtubeLink: url })).status).toBe(201);
    }
  });

  it("rejects control characters and over-long text", async () => {
    await bad({ ...sangeet, name: "Sangeet\u0000" }, "name");
    await bad({ ...sangeet, venueName: "x".repeat(121) }, "venueName");
    await bad({ ...sangeet, notes: "x".repeat(1001) }, "notes");
  });

  it("rejects an empty update", async () => {
    const { userId } = await admin();
    const { id } = await createOk(userId, sangeet);
    const res = await call(
      patchRoute,
      await request(`/api/events/${id}`, { method: "PATCH", userId, body: {} }),
      id,
    );
    expect(res.status).toBe(400);
  });

  it("answers UNKNOWN_EVENT_TYPE for a type nobody added", async () => {
    const { userId } = await admin();
    const res = await create(userId, { ...sangeet, type: "Nalugu" });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("UNKNOWN_EVENT_TYPE");
  });
});

describe("update", () => {
  it("changes fields and clears optional ones with null", async () => {
    const { userId } = await admin();
    const { id } = await createOk(userId, { ...sangeet, youtubeLink: "https://youtu.be/abc" });
    const res = await call(
      patchRoute,
      await request(`/api/events/${id}`, {
        method: "PATCH",
        userId,
        body: { youtubeLink: null, time: "20:00", type: "Reception" },
      }),
      id,
    );
    expect(res.status).toBe(200);
    const { event } = await res.json();
    expect(event).toMatchObject({ time: "20:00", type: "Reception" });
    expect(event).not.toHaveProperty("youtubeLink");
    expect((await Event.findById(id).lean())?.youtubeLink).toBeUndefined();
  });

  it("checks the type on update", async () => {
    const { userId } = await admin();
    const { id } = await createOk(userId, sangeet);
    const res = await call(
      patchRoute,
      await request(`/api/events/${id}`, { method: "PATCH", userId, body: { type: "Nope" } }),
      id,
    );
    expect((await errorOf(res)).code).toBe("UNKNOWN_EVENT_TYPE");
  });

  it("answers 404 for a missing event before it looks at the type", async () => {
    const { userId } = await admin();
    const id = new Types.ObjectId().toHexString();
    const res = await call(
      patchRoute,
      await request(`/api/events/${id}`, { method: "PATCH", userId, body: { type: "Nope" } }),
      id,
    );
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("NOT_FOUND");
  });
});

describe("event types", () => {
  const add = async (userId: string, name: string) =>
    call(
      addTypeRoute,
      await request("/api/events/types", { method: "POST", userId, body: { name } }),
    );

  it("lists the defaults and starts with no custom types", async () => {
    const { userId } = await admin();
    const body = await (
      await call(typesRoute, await request("/api/events/types", { userId }))
    ).json();
    expect(body.default).toEqual([
      "Engagement",
      "Haldi",
      "Mehendi",
      "Sangeet",
      "Pellikuthuru / Pellikoduku",
      "Wedding (Muhurtham)",
      "Reception",
      "Vratham / Pooja",
    ]);
    expect(body.custom).toEqual([]);
  });

  it("adds a custom type that then works for events", async () => {
    const { userId } = await admin();
    const res = await add(userId, "  Nalugu ");
    expect(res.status).toBe(201);
    expect((await res.json()).custom).toEqual(["Nalugu"]);
    const body = await (
      await call(typesRoute, await request("/api/events/types", { userId }))
    ).json();
    expect(body.custom).toEqual(["Nalugu"]);
    expect((await create(userId, { ...sangeet, type: "Nalugu" })).status).toBe(201);
  });

  it("keeps custom types private to each wedding", async () => {
    const a = await admin();
    const b = await admin();
    await add(a.userId, "Nalugu");
    const res = await create(b.userId, { ...sangeet, type: "Nalugu" });
    expect((await errorOf(res)).code).toBe("UNKNOWN_EVENT_TYPE");
  });

  it("refuses a duplicate of a default type, ignoring case", async () => {
    const { userId } = await admin();
    for (const name of ["haldi", "SANGEET", "wedding (muhurtham)"]) {
      const res = await add(userId, name);
      expect(res.status).toBe(409);
      expect((await errorOf(res)).code).toBe("TYPE_EXISTS");
    }
  });

  it("refuses a duplicate of a custom type, ignoring case", async () => {
    const { userId } = await admin();
    await add(userId, "Nalugu");
    const res = await add(userId, "nalugu");
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("TYPE_EXISTS");
  });

  it("treats regex characters in a name as plain text", async () => {
    const { userId } = await admin();
    expect((await add(userId, "Pooja (small)")).status).toBe(201);
    expect((await add(userId, "Pooja .*")).status).toBe(201);
    expect((await add(userId, "pooja (SMALL)")).status).toBe(409);
  });

  it("allows 30 custom types and refuses the 31st", async () => {
    const { userId } = await admin();
    for (let i = 1; i <= 30; i++) expect((await add(userId, `Custom ${i}`)).status).toBe(201);
    const res = await add(userId, "Custom 31");
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("TOO_MANY_TYPES");
  });

  it("two adds of the same name at once leave one", async () => {
    const { userId, weddingId } = await admin();
    const results = await Promise.all([add(userId, "Nalugu"), add(userId, "NALUGU")]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await Wedding.findById(weddingId).lean())?.customEventTypes).toHaveLength(1);
  });

  it("sees accented and non-Latin names as duplicates, not as a full list", async () => {
    const { userId } = await admin();
    expect((await add(userId, "Éngagement Party")).status).toBe(201);
    const dup = await add(userId, "éNGAGEMENT party");
    expect(dup.status).toBe(409);
    expect((await errorOf(dup)).code).toBe("TYPE_EXISTS");
    expect((await add(userId, "కళ్యాణం")).status).toBe(201);
    expect((await add(userId, "కళ్యాణం")).status).toBe(409);
  });

  it("many different adds at once all land, with none lost or doubled", async () => {
    const { userId, weddingId } = await admin();
    const names = Array.from({ length: 8 }, (_, i) => `Type ${i + 1}`);
    const results = await Promise.all(names.map((n) => add(userId, n)));
    expect(results.map((r) => r.status)).toEqual(names.map(() => 201));
    const stored = (await Wedding.findById(weddingId).lean())?.customEventTypes ?? [];
    expect([...stored].sort()).toEqual([...names].sort());
  });

  it("the answer is the saved list, with the new type last", async () => {
    const { userId } = await admin();
    await add(userId, "First");
    const res = await add(userId, "Second");
    expect((await res.json()).custom).toEqual(["First", "Second"]);
  });

  it("rejects an empty or over-long name", async () => {
    const { userId } = await admin();
    expect((await add(userId, "   ")).status).toBe(400);
    expect((await add(userId, "x".repeat(41))).status).toBe(400);
  });
});

describe("access", () => {
  const anon = [
    () => request("/api/events"),
    () => request("/api/events", { method: "POST", body: sangeet }),
    () => request("/api/events/types"),
    () => request("/api/events/types", { method: "POST", body: { name: "X" } }),
  ];

  it("answers 401 without a session on the collection routes", async () => {
    const routes = [listRoute, createRoute, typesRoute, addTypeRoute];
    for (const [i, route] of routes.entries()) {
      const res = await call(route, await anon[i]!());
      expect(res.status).toBe(401);
    }
  });

  it("answers 401 without a session on the single-event routes", async () => {
    const id = new Types.ObjectId().toHexString();
    const checks: [Route, string, string?][] = [
      [getRoute, `/api/events/${id}`],
      [patchRoute, `/api/events/${id}`, "PATCH"],
      [deleteRoute, `/api/events/${id}`, "DELETE"],
      [impactRoute, `/api/events/${id}/delete-impact`],
    ];
    for (const [route, path, method] of checks) {
      const res = await call(
        route,
        await request(path, { method, body: method === "PATCH" ? { name: "x" } : undefined }),
        id,
      );
      expect(res.status).toBe(401);
    }
  });

  it("answers 404 for another wedding's event on every route, and leaves it alone", async () => {
    const a = await admin();
    const b = await admin();
    const { id } = await createOk(a.userId, sangeet);

    const attempts: [Route, string, string | undefined, unknown][] = [
      [getRoute, `/api/events/${id}`, undefined, undefined],
      [patchRoute, `/api/events/${id}`, "PATCH", { venueName: "Hijacked" }],
      [impactRoute, `/api/events/${id}/delete-impact`, undefined, undefined],
      [deleteRoute, `/api/events/${id}`, "DELETE", undefined],
    ];
    for (const [route, path, method, body] of attempts) {
      const res = await call(route, await request(path, { method, userId: b.userId, body }), id);
      expect(res.status).toBe(404);
      expect((await errorOf(res)).code).toBe("NOT_FOUND");
    }
    const stored = await Event.findById(id).lean();
    expect(stored?.venueName).toBe(sangeet.venueName);
    expect((await list(b.userId)).items).toEqual([]);
    expect((await list(a.userId)).items).toHaveLength(1);
  });

  it("answers 404 for a malformed or unknown id", async () => {
    const { userId } = await admin();
    for (const id of ["nope", new Types.ObjectId().toHexString()]) {
      const res = await call(getRoute, await request(`/api/events/${id}`, { userId }), id);
      expect(res.status).toBe(404);
    }
  });

  it("refuses a write from another site", async () => {
    const { userId } = await admin();
    const res = await call(
      createRoute,
      await request("/api/events", {
        method: "POST",
        userId,
        body: sangeet,
        origin: "https://evil.example",
      }),
    );
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("FORBIDDEN_ORIGIN");
  });
});

describe("get, delete impact and delete", () => {
  const addQr = (weddingId: Types.ObjectId, eventId: string) => {
    const token = generateToken();
    return QrCode.create({
      weddingId,
      eventId,
      label: "Sangeet",
      tokenHash: hashToken(token),
      tokenEnc: encryptToken(token),
    });
  };

  it("returns the event with its RSVP counts", async () => {
    const { userId } = await admin();
    const { id } = await createOk(userId, sangeet);
    const res = await call(getRoute, await request(`/api/events/${id}`, { userId }), id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toMatchObject({ id, name: "Sangeet Night", guestCount: 0 });
    expect(body.rsvp).toEqual({
      invited: 0,
      attending: 0,
      declined: 0,
      notReplied: 0,
      headcount: 0,
    });
  });

  it("counts what a delete would touch, with zeros for modules not built yet", async () => {
    const { userId, weddingId } = await admin();
    const { id } = await createOk(userId, sangeet);
    const res = await call(
      impactRoute,
      await request(`/api/events/${id}/delete-impact`, { userId }),
      id,
    );
    expect(await res.json()).toEqual({
      guests: 0,
      rsvps: 0,
      expenses: 0,
      gifts: 0,
      tasks: 0,
      vendors: 0,
      qrCodes: 0,
      photos: 0,
    });
    await addQr(weddingId, id);
    const again = await call(
      impactRoute,
      await request(`/api/events/${id}/delete-impact`, { userId }),
      id,
    );
    expect((await again.json()).qrCodes).toBe(1);
  });

  it("deletes the event and its QR code, and nothing else", async () => {
    const { userId, weddingId } = await admin();
    const { id } = await createOk(userId, sangeet);
    const other = await createOk(userId, { ...sangeet, name: "Haldi", type: "Haldi" });
    await addQr(weddingId, id);
    await addQr(weddingId, other.id);
    // The whole-wedding code has no event and must stay.
    const token = generateToken();
    await QrCode.create({
      weddingId,
      label: "Whole wedding",
      tokenHash: hashToken(token),
      tokenEnc: encryptToken(token),
    });

    const res = await call(
      deleteRoute,
      await request(`/api/events/${id}`, { method: "DELETE", userId }),
      id,
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(await Event.findById(id)).toBeNull();
    expect(await QrCode.countDocuments({ eventId: id })).toBe(0);
    expect(await QrCode.countDocuments({ eventId: other.id })).toBe(1);
    expect(await QrCode.countDocuments({ weddingId, eventId: { $exists: false } })).toBe(1);
    expect((await list(userId)).items).toHaveLength(1);

    const again = await call(
      deleteRoute,
      await request(`/api/events/${id}`, { method: "DELETE", userId }),
      id,
    );
    expect(again.status).toBe(404);
  });
});

describe("deleting the wedding", () => {
  it("removes its events and leaves another wedding's alone", async () => {
    const a = await admin();
    const b = await admin();
    await createOk(a.userId, sangeet);
    await createOk(a.userId, { ...sangeet, name: "Haldi", type: "Haldi" });
    await createOk(b.userId, sangeet);
    const slug = (await Wedding.findById(a.weddingId).lean())!.slug;

    const res = await call(
      deleteWeddingRoute,
      await request("/api/wedding", {
        method: "DELETE",
        userId: a.userId,
        body: { confirmSlug: slug },
      }),
    );
    expect(res.status).toBe(204);
    expect(await Event.countDocuments({ weddingId: a.weddingId })).toBe(0);
    expect(await Event.countDocuments({ weddingId: b.weddingId })).toBe(1);
  });
});
