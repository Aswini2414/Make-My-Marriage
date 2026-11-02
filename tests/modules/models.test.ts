import mongoose, { type Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PasswordReset, User } from "@/modules/auth/model";
import { MemberInvite, Membership } from "@/modules/members/model";
import { Wedding } from "@/modules/weddings/model";
import { createUser, emptyDb, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

const weddingFields = (createdBy: Types.ObjectId, slug = "priya-weds-ravi") => ({
  brideName: "Priya",
  groomName: "Ravi",
  weddingDate: "2027-02-14",
  slug,
  createdBy,
});

describe("users", () => {
  it("lowercases and trims the email, and refuses a duplicate", async () => {
    const user = await User.create({ name: "A", email: "  Leela@Example.COM ", passwordHash: "x" });
    expect(user.email).toBe("leela@example.com");
    await expect(
      User.create({ name: "B", email: "leela@example.com", passwordHash: "x" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("never loads passwordHash unless asked", async () => {
    await createUser();
    expect((await User.findOne().lean())!.passwordHash).toBeUndefined();
    expect((await User.findOne().select("+passwordHash").lean())!.passwordHash).toBeTruthy();
  });
});

describe("weddings", () => {
  it("applies the defaults from the database design", async () => {
    const user = await createUser();
    const wedding = await Wedding.create(weddingFields(user._id));
    expect(wedding).toMatchObject({
      theme: "classic",
      websitePublished: false,
      galleryEnabled: false,
      customEventTypes: [],
      storageUsedBytes: 0,
    });
  });

  it("keeps slugs unique and rejects bad dates and slugs", async () => {
    const user = await createUser();
    await Wedding.create(weddingFields(user._id));
    await expect(Wedding.create(weddingFields(user._id))).rejects.toMatchObject({ code: 11000 });
    await expect(Wedding.create(weddingFields(user._id, "Bad Slug"))).rejects.toThrow();
    await expect(
      Wedding.create({ ...weddingFields(user._id, "other-slug"), weddingDate: "14/02/2027" }),
    ).rejects.toThrow();
  });
});

describe("memberships", () => {
  it("allows only one active workspace per person, but any number of removed ones", async () => {
    const user = await createUser();
    const a = await Wedding.create(weddingFields(user._id, "wedding-a"));
    const b = await Wedding.create(weddingFields(user._id, "wedding-b"));
    const c = await Wedding.create(weddingFields(user._id, "wedding-c"));

    await Membership.create({ weddingId: a._id, userId: user._id, role: "admin" });
    await expect(
      Membership.create({ weddingId: b._id, userId: user._id, role: "manager" }),
    ).rejects.toMatchObject({ code: 11000 });

    await Membership.create({
      weddingId: b._id,
      userId: user._id,
      role: "manager",
      status: "removed",
    });
    await Membership.create({
      weddingId: c._id,
      userId: user._id,
      role: "manager",
      status: "removed",
    });
    expect(await Membership.countDocuments({ userId: user._id })).toBe(3);
  });

  it("only accepts the roles admin and manager", async () => {
    const user = await createUser();
    const w = await Wedding.create(weddingFields(user._id));
    await expect(
      Membership.create({ weddingId: w._id, userId: user._id, role: "owner" as "admin" }),
    ).rejects.toThrow();
  });
});

describe("tokens", () => {
  it("memberInvites and passwordResets keep unique hashes that are never loaded by default", async () => {
    const user = await createUser();
    const w = await Wedding.create(weddingFields(user._id));
    const expiresAt = new Date(Date.now() + 60_000);
    const tokenHash = "a".repeat(64);

    await MemberInvite.create({
      weddingId: w._id,
      name: "Anil",
      email: "Anil@Example.com",
      role: "manager",
      tokenHash,
      invitedBy: user._id,
      expiresAt,
    });
    await expect(
      MemberInvite.create({
        weddingId: w._id,
        name: "B",
        email: "b@example.com",
        role: "manager",
        tokenHash,
        invitedBy: user._id,
        expiresAt,
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect((await MemberInvite.findOne().lean())!.tokenHash).toBeUndefined();

    await PasswordReset.create({ userId: user._id, tokenHash, expiresAt });
    expect((await PasswordReset.findOne().lean())!.tokenHash).toBeUndefined();
  });

  it("creates TTL indexes on expiresAt", async () => {
    for (const m of [MemberInvite, PasswordReset]) {
      const indexes = await m.collection.indexes();
      expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
    }
  });
});

describe("collection names", () => {
  it("match the database design", async () => {
    expect([
      User.collection.name,
      Wedding.collection.name,
      Membership.collection.name,
      MemberInvite.collection.name,
      PasswordReset.collection.name,
    ]).toEqual(["users", "weddings", "memberships", "memberInvites", "passwordResets"]);
  });
});
