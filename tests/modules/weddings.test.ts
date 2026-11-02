import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getWedding, PATCH as patchWedding } from "@/app/api/wedding/route";
import { GET as slugAvailable } from "@/app/api/wedding/slug-available/route";
import { POST as createWedding } from "@/app/api/weddings/route";
import { decryptToken, hashToken } from "@/lib/tokens";
import { Membership } from "@/modules/members/model";
import { QrCode } from "@/modules/qr/model";
import { Wedding } from "@/modules/weddings/model";
import { DELETE as deleteWedding } from "@/app/api/wedding/route";
import { MemberInvite } from "@/modules/members/model";
import { addYears, todayIST } from "@/lib/dates";
import { baseSlug, isReservedSlug, slugify } from "@/modules/weddings/slug";
import { createMember, createUser, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

const ctx = undefined;
// Route handlers take (request, context); these routes have no dynamic segments.
const call = (route: (req: never, ctx: never) => Promise<Response>, req: unknown) =>
  route(req as never, ctx as never);

const couple = { brideName: "Priya", groomName: "Ravi", weddingDate: "2027-02-14" };

async function errorOf(res: Response) {
  return (await res.json()).error as { code: string; message: string; fields?: unknown };
}

describe("slugs", () => {
  it("builds the address from the names", () => {
    expect(baseSlug("Priya", "Ravi")).toBe("priya-weds-ravi");
    expect(baseSlug("Anaïs & Co.", " José ")).toBe("anais-co-weds-jose");
  });

  it("falls back when the names leave nothing usable", () => {
    expect(slugify("राधा")).toBe("");
    expect(baseSlug("राधा", "कृष्ण")).toBe("our-wedding");
    expect(baseSlug("राधा", "Krishna")).toBe("krishna");
  });

  it("stays short enough to take a number", () => {
    expect(baseSlug("a".repeat(60), "b".repeat(60)).length).toBeLessThanOrEqual(56);
  });

  it("knows the reserved words", () => {
    for (const word of ["api", "dashboard", "login", "admin"])
      expect(isReservedSlug(word)).toBe(true);
    expect(isReservedSlug("priya-weds-ravi")).toBe(false);
  });
});

describe("POST /api/weddings", () => {
  it("creates the wedding, an Admin membership and the whole-wedding QR code", async () => {
    const user = await createUser();
    const res = await call(
      createWedding,
      await request("/api/weddings", { method: "POST", userId: String(user._id), body: couple }),
    );
    expect(res.status).toBe(201);
    const { wedding } = await res.json();
    expect(wedding).toMatchObject({
      brideName: "Priya",
      groomName: "Ravi",
      weddingDate: "2027-02-14",
      slug: "priya-weds-ravi",
      theme: "classic",
      websitePublished: false,
      galleryEnabled: false,
    });

    const membership = await Membership.findOne({ userId: user._id });
    expect(membership).toMatchObject({ role: "admin", status: "active" });
    expect(String(membership!.weddingId)).toBe(wedding.id);
    expect(membership!.joinedAt).toBeInstanceOf(Date);
    expect(String((await Wedding.findById(wedding.id))!.createdBy)).toBe(String(user._id));

    const qr = await QrCode.findOne({ weddingId: wedding.id }).select("+tokenHash +tokenEnc");
    expect(qr).toMatchObject({ label: "Whole wedding", uploadsEnabled: true });
    expect(qr!.eventId).toBeUndefined();
    expect(hashToken(decryptToken(qr!.tokenEnc))).toBe(qr!.tokenHash);
  });

  it("adds a number when the address is taken", async () => {
    const first = await createUser("A", "a@example.com");
    const second = await createUser("B", "b@example.com");
    const third = await createUser("C", "c@example.com");
    const slugs: string[] = [];
    for (const u of [first, second, third]) {
      const res = await call(
        createWedding,
        await request("/api/weddings", { method: "POST", userId: String(u._id), body: couple }),
      );
      slugs.push((await res.json()).wedding.slug);
    }
    expect(slugs).toEqual(["priya-weds-ravi", "priya-weds-ravi-2", "priya-weds-ravi-3"]);
  });

  it("answers 409 ALREADY_IN_WORKSPACE for someone who already has a wedding", async () => {
    const { user } = await createMember("admin");
    const res = await call(
      createWedding,
      await request("/api/weddings", { method: "POST", userId: String(user._id), body: couple }),
    );
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("ALREADY_IN_WORKSPACE");
    expect(await Wedding.countDocuments()).toBe(1);
  });

  it("lets only one of two simultaneous requests through, leaving nothing half-made", async () => {
    const user = await createUser();
    const send = async () =>
      call(
        createWedding,
        await request("/api/weddings", { method: "POST", userId: String(user._id), body: couple }),
      );
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Wedding.countDocuments()).toBe(1);
    expect(await Membership.countDocuments()).toBe(1);
    expect(await QrCode.countDocuments()).toBe(1);
  });

  it("answers 401 without a session", async () => {
    const res = await call(
      createWedding,
      await request("/api/weddings", { method: "POST", body: couple }),
    );
    expect(res.status).toBe(401);
  });

  it("answers 403 from a foreign Origin", async () => {
    const user = await createUser();
    const res = await call(
      createWedding,
      await request("/api/weddings", {
        method: "POST",
        userId: String(user._id),
        body: couple,
        origin: "https://evil.example",
      }),
    );
    expect(res.status).toBe(403);
    expect(await Wedding.countDocuments()).toBe(0);
  });

  it("names the fields that need fixing", async () => {
    const user = await createUser();
    const res = await call(
      createWedding,
      await request("/api/weddings", {
        method: "POST",
        userId: String(user._id),
        body: { brideName: "  ", groomName: "x".repeat(61), weddingDate: "2027-02-30" },
      }),
    );
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fields).toEqual({
      brideName: "Enter the bride's name.",
      groomName: "Use at most 60 characters.",
      weddingDate: "Choose the wedding date.",
    });
    expect(await Wedding.countDocuments()).toBe(0);
  });
});

describe("GET and PATCH /api/wedding", () => {
  it("returns only the caller's own wedding, to either role", async () => {
    const admin = await createMember("admin");
    await createMember("manager", "m@example.com", admin.weddingId);
    const other = await createMember("admin");
    await Wedding.updateOne({ _id: other.weddingId }, { brideName: "Someone Else" });

    for (const email of ["m@example.com", undefined]) {
      const userId = String(
        email ? (await mongoose.model("User").findOne({ email }))!._id : admin.user._id,
      );
      const res = await call(getWedding, await request("/api/wedding", { userId }));
      expect(res.status).toBe(200);
      const { wedding } = await res.json();
      expect(wedding.id).toBe(String(admin.weddingId));
      expect(wedding.brideName).toBe("Priya");
    }
  });

  it("answers 401 without a session and 403 NO_WORKSPACE without a wedding", async () => {
    expect((await call(getWedding, await request("/api/wedding"))).status).toBe(401);
    const user = await createUser();
    const res = await call(getWedding, await request("/api/wedding", { userId: String(user._id) }));
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("NO_WORKSPACE");
    const patch = await call(
      patchWedding,
      await request("/api/wedding", {
        method: "PATCH",
        userId: String(user._id),
        body: { theme: "floral" },
      }),
    );
    expect(patch.status).toBe(403);
  });

  it("lets a Manager change details, and changes only their own wedding", async () => {
    const mine = await createMember("manager");
    const other = await createMember("admin");
    const res = await call(
      patchWedding,
      await request("/api/wedding", {
        method: "PATCH",
        userId: String(mine.user._id),
        body: {
          brideName: "Meera",
          theme: "floral",
          websitePublished: true,
          rsvpCutoffDate: "2027-02-01",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).wedding).toMatchObject({
      brideName: "Meera",
      theme: "floral",
      websitePublished: true,
      rsvpCutoffDate: "2027-02-01",
    });
    expect((await Wedding.findById(other.weddingId))!.brideName).toBe("Priya");
  });

  it("clears the RSVP cutoff date with null", async () => {
    const { user, weddingId } = await createMember("admin");
    await Wedding.updateOne({ _id: weddingId }, { rsvpCutoffDate: "2027-02-01" });
    const res = await call(
      patchWedding,
      await request("/api/wedding", {
        method: "PATCH",
        userId: String(user._id),
        body: { rsvpCutoffDate: null },
      }),
    );
    expect((await res.json()).wedding.rsvpCutoffDate).toBeNull();
    expect((await Wedding.findById(weddingId))!.rsvpCutoffDate).toBeUndefined();
  });

  it("refuses a taken or reserved address, and keeps the old one", async () => {
    const mine = await createMember("admin");
    await Wedding.create({
      brideName: "A",
      groomName: "B",
      weddingDate: "2027-01-01",
      slug: "taken-address",
      createdBy: mine.user._id,
    });
    const patch = async (slug: string) =>
      call(
        patchWedding,
        await request("/api/wedding", {
          method: "PATCH",
          userId: String(mine.user._id),
          body: { slug },
        }),
      );
    const taken = await patch("taken-address");
    expect(taken.status).toBe(409);
    expect((await errorOf(taken)).code).toBe("SLUG_TAKEN");
    const reserved = await patch("dashboard");
    expect(reserved.status).toBe(400);
    expect((await errorOf(reserved)).code).toBe("SLUG_RESERVED");
    const bad = await patch("Has Spaces");
    expect(bad.status).toBe(400);
    expect((await Wedding.findById(mine.weddingId))!.slug).toMatch(/^priya-weds-ravi-/);
    const ok = await patch("priya-and-ravi");
    expect((await ok.json()).wedding.slug).toBe("priya-and-ravi");
  });

  it("refuses an empty change and ignores fields it does not own", async () => {
    const { user, weddingId } = await createMember("admin");
    const send = async (body: unknown) =>
      call(
        patchWedding,
        await request("/api/wedding", { method: "PATCH", userId: String(user._id), body }),
      );
    expect((await send({})).status).toBe(400);
    expect(
      (await send({ createdBy: "x", storageUsedBytes: 1, coverPhotoKey: "weddings/x/a.jpg" }))
        .status,
    ).toBe(400);
    const wedding = (await Wedding.findById(weddingId))!;
    expect(wedding.storageUsedBytes).toBe(0);
    expect(wedding.coverPhotoKey).toBeUndefined();
  });
});

describe("GET /api/wedding/slug-available", () => {
  it("reports free, taken with a suggestion, and the caller's own address", async () => {
    const mine = await createMember("manager");
    const own = (await Wedding.findById(mine.weddingId))!.slug;
    await Wedding.create({
      brideName: "A",
      groomName: "B",
      weddingDate: "2027-01-01",
      slug: "taken-address",
      createdBy: mine.user._id,
    });
    const check = async (slug: string) =>
      call(
        slugAvailable,
        await request(`/api/wedding/slug-available?slug=${encodeURIComponent(slug)}`, {
          userId: String(mine.user._id),
        }),
      );
    expect(await (await check("brand-new")).json()).toEqual({ available: true });
    expect(await (await check("taken-address")).json()).toEqual({
      available: false,
      suggestion: "taken-address-2",
    });
    expect(await (await check(own)).json()).toEqual({ available: true });
    expect((await check("api")).status).toBe(400);
    expect((await check("x")).status).toBe(400);
  });

  it("answers 401 without a session and 403 without a wedding", async () => {
    expect(
      (await call(slugAvailable, await request("/api/wedding/slug-available?slug=abc"))).status,
    ).toBe(401);
    const user = await createUser();
    const res = await call(
      slugAvailable,
      await request("/api/wedding/slug-available?slug=abc", { userId: String(user._id) }),
    );
    expect(res.status).toBe(403);
  });
});

describe("name and date rules", () => {
  const create = async (body: unknown) => {
    const user = await createUser("Leela", `u${Math.random()}@example.com`);
    return call(
      createWedding,
      await request("/api/weddings", { method: "POST", userId: String(user._id), body }),
    );
  };

  it("refuses control characters in names", async () => {
    for (const bad of ["Pri\u0000ya", "Pri\nya", "Pri\tya", "Pri\u007fya", "Pri\u2028ya"]) {
      const res = await create({ ...couple, brideName: bad });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).fields).toHaveProperty("brideName");
    }
  });

  it("accepts ordinary and non-Latin names", async () => {
    const res = await create({ ...couple, brideName: "राधा", groomName: "O'Brien-Smith Jr." });
    expect(res.status).toBe(201);
  });

  it("limits the wedding date to a sensible window", async () => {
    const today = todayIST();
    const bad = [
      "0001-01-01",
      "9999-12-31",
      "1990-05-05",
      addYears(today, 11),
      addYears(today, -3),
    ];
    for (const weddingDate of bad) {
      const res = await create({ ...couple, weddingDate });
      expect(res.status, weddingDate).toBe(400);
      expect((await errorOf(res)).fields).toHaveProperty("weddingDate");
    }
    const good = [today, addYears(today, 1), addYears(today, -1), addYears(today, 9)];
    for (const weddingDate of good) {
      expect((await create({ ...couple, weddingDate })).status, weddingDate).toBe(201);
    }
  });
});

describe("RSVP cut-off against the wedding date", () => {
  const patch = async (userId: string, body: unknown) =>
    call(patchWedding, await request("/api/wedding", { method: "PATCH", userId, body }));

  it("refuses a cut-off after the wedding, and a date moved before the cut-off", async () => {
    const { user, weddingId } = await createMember("admin");
    const id = String(user._id);
    const late = await patch(id, { rsvpCutoffDate: "2027-03-01" });
    expect(late.status).toBe(400);
    expect((await errorOf(late)).fields).toHaveProperty("rsvpCutoffDate");

    expect((await patch(id, { rsvpCutoffDate: "2027-02-14" })).status).toBe(200);
    const moved = await patch(id, { weddingDate: "2027-02-01" });
    expect(moved.status).toBe(400);
    expect((await errorOf(moved)).fields).toHaveProperty("weddingDate");
    expect((await Wedding.findById(weddingId))!.weddingDate).toBe("2027-02-14");

    // Both together are checked as a pair.
    const pair = await patch(id, { weddingDate: "2027-02-01", rsvpCutoffDate: "2027-01-20" });
    expect(pair.status).toBe(200);
    expect((await patch(id, { rsvpCutoffDate: null })).status).toBe(200);
  });
});

describe("DELETE /api/wedding", () => {
  const remove = async (userId: string | undefined, body: unknown) =>
    call(deleteWedding, await request("/api/wedding", { method: "DELETE", userId, body }));

  async function slugOf(weddingId: unknown) {
    return (await Wedding.findById(weddingId))!.slug;
  }

  it("deletes the wedding, its QR codes and invites, and frees every member", async () => {
    const { user, weddingId } = await createMember("admin");
    const manager = await createMember("manager", undefined, weddingId);
    await QrCode.create({ weddingId, label: "Whole wedding", tokenHash: "h", tokenEnc: "e" });
    await MemberInvite.create({
      weddingId,
      name: "Anil",
      email: "anil@example.com",
      role: "manager",
      tokenHash: "x",
      invitedBy: user._id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const res = await remove(String(user._id), { confirmSlug: await slugOf(weddingId) });
    expect(res.status).toBe(204);
    expect(await Wedding.countDocuments()).toBe(0);
    expect(await QrCode.countDocuments()).toBe(0);
    expect(await MemberInvite.countDocuments()).toBe(0);
    expect(await Membership.countDocuments({ status: "active" })).toBe(0);
    expect(await Membership.countDocuments({ status: "removed" })).toBe(2);
    // They can start again.
    const again = await call(
      createWedding,
      await request("/api/weddings", {
        method: "POST",
        userId: String(manager.user._id),
        body: couple,
      }),
    );
    expect(again.status).toBe(201);
  });

  it("needs the exact address", async () => {
    const { user, weddingId } = await createMember("admin");
    for (const body of [{ confirmSlug: "wrong" }, { confirmSlug: "" }, {}]) {
      const res = await remove(String(user._id), body);
      expect(res.status).toBe(400);
    }
    expect(await Wedding.countDocuments()).toBe(1);
    // Case and spaces don't matter.
    const slug = await slugOf(weddingId);
    const res = await remove(String(user._id), { confirmSlug: `  ${slug.toUpperCase()} ` });
    expect(res.status).toBe(204);
  });

  it("is for Admins only, and only their own wedding", async () => {
    const { weddingId } = await createMember("admin");
    const manager = await createMember("manager", undefined, weddingId);
    const slug = await slugOf(weddingId);
    expect((await remove(String(manager.user._id), { confirmSlug: slug })).status).toBe(403);
    expect((await remove(undefined, { confirmSlug: slug })).status).toBe(401);
    const outsider = await createUser("Out", "out@example.com");
    expect((await remove(String(outsider._id), { confirmSlug: slug })).status).toBe(403);

    const other = await createMember("admin");
    // Another wedding's address is no use to an Admin of this one.
    expect((await remove(String(other.user._id), { confirmSlug: slug })).status).toBe(400);
    expect(await Wedding.countDocuments()).toBe(2);
  });
});
