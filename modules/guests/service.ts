import "server-only";
import mongoose, { type Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { encryptToken, generateToken, hashToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { removeGuests, unlinkEvents } from "./dependents";
import { Guest, type GuestAttrs } from "./model";
import { phoneSearchPattern } from "./phone";
import type { CreateGuestInput, GuestDetails, ListGuestsQuery, UpdateGuestInput } from "./schema";
import type {
  DuplicateMatch,
  DuplicateWarning,
  GuestItem,
  GuestList,
  HouseholdItem,
  InviteStatus,
} from "./types";

// Every function takes weddingId first and filters by it, so one wedding can never reach
// another's guests. A missing id and another wedding's id both answer 404.
//
// Logging: never write a guest's phone or email anywhere. Ids and counts only.

type GuestDoc = GuestAttrs & { _id: Types.ObjectId };

function inviteStatusOf(g: Pick<GuestAttrs, "lastInviteSentAt" | "inviteOpenedAt">): InviteStatus {
  if (g.inviteOpenedAt) return "opened";
  if (g.lastInviteSentAt) return "sent";
  return "not_sent";
}

function toGuestItem(g: GuestDoc): GuestItem {
  return {
    id: String(g._id),
    name: g.name,
    ...(g.email ? { email: g.email } : {}),
    ...(g.phone ? { phone: g.phone } : {}),
    ...(g.relation ? { relation: g.relation } : {}),
    ...(g.household ? { household: g.household } : {}),
    eventIds: g.eventIds.map(String),
    inviteStatus: inviteStatusOf(g),
    ...(g.lastInviteSentAt ? { lastInviteSentAt: g.lastInviteSentAt.toISOString() } : {}),
    ...(g.inviteOpenedAt ? { inviteOpenedAt: g.inviteOpenedAt.toISOString() } : {}),
    // Phase 4: `replied` counts the guest's rsvps.
    rsvp: { replied: 0, of: g.eventIds.length },
  };
}

/** A fresh personal invitation link token, as the hash and encrypted copy the database keeps. */
function newInviteToken() {
  const token = generateToken();
  return { inviteTokenHash: hashToken(token), inviteTokenEnc: encryptToken(token) };
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every event id must be this wedding's. An unknown id and another wedding's id give the same
 * answer, so nothing leaks.
 */
export async function assertEventsBelong(
  wid: Types.ObjectId,
  ids: string[],
): Promise<Types.ObjectId[]> {
  const objectIds = ids.map((id) => toObjectId(id));
  if (objectIds.length === 0) return objectIds;
  const found = await Event.countDocuments({ weddingId: wid, _id: { $in: objectIds } });
  if (found !== objectIds.length) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { eventIds: "Choose events from this wedding." },
    });
  }
  return objectIds;
}

/** Other guests in this wedding with the same email or phone (both already normalised). */
export async function findDuplicates(
  wid: Types.ObjectId,
  contact: { email?: string; phone?: string },
  excludeId?: Types.ObjectId,
): Promise<DuplicateMatch[]> {
  const or: Record<string, string>[] = [];
  if (contact.email) or.push({ email: contact.email });
  if (contact.phone) or.push({ phone: contact.phone });
  if (or.length === 0) return [];
  const found = await Guest.find({
    weddingId: wid,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: or,
  })
    .select("name email phone")
    .sort({ name: 1, _id: 1 })
    .limit(10)
    .lean();
  return found.map((g) => ({
    id: String(g._id),
    name: g.name,
    ...(g.email ? { email: g.email } : {}),
    ...(g.phone ? { phone: g.phone } : {}),
    matchedOn: [
      ...(contact.email && g.email === contact.email ? (["email"] as const) : []),
      ...(contact.phone && g.phone === contact.phone ? (["phone"] as const) : []),
    ],
  }));
}

// ---- list ----

function encodeCursor(offset: number) {
  return Buffer.from(String(offset)).toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const text = Buffer.from(cursor, "base64url").toString();
  if (!/^\d{1,7}$/.test(text)) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { cursor: "That page isn't valid." },
    });
  }
  return Number(text);
}

/**
 * Phase 4 replaces this with a lookup in rsvps. Until then nobody has answered, so no guest is
 * "attending" or "declined", and everyone is "not replied".
 */
function rsvpMatchesNobody(status: ListGuestsQuery["rsvpStatus"]) {
  return status === "attending" || status === "declined";
}

export async function listGuests(weddingId: string, query: ListGuestsQuery): Promise<GuestList> {
  await connectDb();
  const wid = toObjectId(weddingId);

  if (query.rsvpStatus && !query.eventId) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { rsvpStatus: "Choose an event to filter by reply." },
    });
  }
  const offset = decodeCursor(query.cursor);
  if (rsvpMatchesNobody(query.rsvpStatus)) return { items: [], total: 0 };

  const filter: Record<string, unknown> = { weddingId: wid };
  if (query.eventId) filter.eventIds = toObjectId(query.eventId);
  // A case-sensitive regex, not equality: the list's collation would make equality ignore case,
  // while the household dropdown (listHouseholds) tells "Rao family" and "rao family" apart.
  if (query.household) filter.household = { $regex: `^${escapeRegex(query.household)}$` };
  if (query.inviteStatus === "opened") filter.inviteOpenedAt = { $exists: true };
  if (query.inviteStatus === "sent") {
    filter.lastInviteSentAt = { $exists: true };
    filter.inviteOpenedAt = { $exists: false };
  }
  if (query.inviteStatus === "not_sent") {
    filter.lastInviteSentAt = { $exists: false };
    filter.inviteOpenedAt = { $exists: false };
  }
  if (query.q) {
    const text = escapeRegex(query.q);
    const or: Record<string, unknown>[] = [
      { name: { $regex: text, $options: "i" } },
      { email: { $regex: text, $options: "i" } },
      { household: { $regex: text, $options: "i" } },
    ];
    // "98480", "+91 98480" and "98480-12" all find +91 98480 12345.
    const digits = query.q.replace(/\D/g, "");
    if (digits.length >= 3 && /^[\d\s+()-]+$/.test(query.q)) {
      or.push({ phone: { $regex: phoneSearchPattern(digits) } });
    }
    filter.$or = or;
  }

  const sort: Record<string, 1 | -1> =
    query.sort === "-createdAt" ? { createdAt: -1, _id: -1 } : { name: 1, _id: 1 };
  const [total, found] = await Promise.all([
    Guest.countDocuments(filter),
    Guest.find(filter)
      .sort(sort)
      .collation({ locale: "en", strength: 2 })
      .skip(offset)
      .limit(query.limit + 1)
      .lean(),
  ]);
  const page = found.slice(0, query.limit);
  return {
    items: page.map(toGuestItem),
    ...(found.length > query.limit ? { nextCursor: encodeCursor(offset + query.limit) } : {}),
    total,
  };
}

// ---- one guest ----

async function findGuest(wid: Types.ObjectId, id: string) {
  const guest = await Guest.findOne({ _id: toObjectId(id), weddingId: wid }).lean();
  if (!guest) throw new ApiError("NOT_FOUND");
  return guest;
}

export type GuestRsvp = {
  eventId: string;
  attending: boolean;
  headcount: number;
  respondedAt: string;
};

export async function getGuest(
  weddingId: string,
  id: string,
): Promise<{ guest: GuestItem; rsvps: GuestRsvp[] }> {
  await connectDb();
  const guest = await findGuest(toObjectId(weddingId), id);
  // Phase 4: load the guest's rsvps.
  return { guest: toGuestItem(guest), rsvps: [] };
}

export type SaveResult = { guest: GuestItem } | DuplicateWarning;

export async function createGuest(weddingId: string, input: CreateGuestInput): Promise<SaveResult> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const eventIds = await assertEventsBelong(wid, input.eventIds ?? []);

  if (!input.confirmDuplicates) {
    const duplicates = await findDuplicates(wid, input);
    if (duplicates.length > 0) return { saved: false, duplicates };
  }
  const created = await Guest.create({
    name: input.name,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.relation ? { relation: input.relation } : {}),
    ...(input.household ? { household: input.household } : {}),
    eventIds,
    weddingId: wid,
    ...newInviteToken(),
  });
  return { guest: toGuestItem(created.toObject()) };
}

export async function updateGuest(
  weddingId: string,
  id: string,
  input: UpdateGuestInput,
): Promise<SaveResult> {
  await connectDb();
  const wid = toObjectId(weddingId);
  // A missing guest answers 404 before anything else is checked.
  const existing = await findGuest(wid, id);
  const eventIds = input.eventIds ? await assertEventsBelong(wid, input.eventIds) : undefined;

  // Only a contact detail that is being changed can be a new duplicate, so editing someone
  // whose email already matches another guest does not ask again.
  if (!input.confirmDuplicates) {
    const duplicates = await findDuplicates(
      wid,
      {
        email: input.email && input.email !== existing.email ? input.email : undefined,
        phone: input.phone && input.phone !== existing.phone ? input.phone : undefined,
      },
      existing._id,
    );
    if (duplicates.length > 0) return { saved: false, duplicates };
  }

  // null clears an optional field.
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  for (const key of ["name", "email", "phone", "relation", "household"] as const) {
    const value = input[key];
    if (value === null) unset[key] = 1;
    else if (value !== undefined) set[key] = value;
  }
  // Phase 4: for events taken out of eventIds, delete the guest's rsvps for them.
  if (eventIds) set.eventIds = eventIds;
  const changes = {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
  const guest = await Guest.findOneAndUpdate({ _id: existing._id, weddingId: wid }, changes, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  if (!guest) throw new ApiError("NOT_FOUND");
  return { guest: toGuestItem(guest) };
}

/** Runs `fn` in a transaction. */
async function inTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(fn);
  } finally {
    await session.endSession();
  }
}

/** Every id must be this wedding's guest, or the whole call answers 404 and changes nothing. */
async function assertGuestsBelong(wid: Types.ObjectId, ids: string[]): Promise<Types.ObjectId[]> {
  const unique = [...new Set(ids.map((id) => String(toObjectId(id))))];
  const objectIds = unique.map((id) => toObjectId(id));
  const found = await Guest.countDocuments({ weddingId: wid, _id: { $in: objectIds } });
  if (found !== objectIds.length) throw new ApiError("NOT_FOUND");
  return objectIds;
}

/** The one way a single guest is deleted. The clean-up lives in `removeGuests`. */
export async function deleteGuest(weddingId: string, id: string): Promise<void> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const guestId = toObjectId(id);
  await inTransaction(async (session) => {
    const deleted = await removeGuests(wid, [guestId], session);
    if (deleted === 0) throw new ApiError("NOT_FOUND");
  });
}

export async function deleteGuests(weddingId: string, ids: string[]): Promise<{ deleted: number }> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const guestIds = await assertGuestsBelong(wid, ids);
  const deleted = await inTransaction((session) => removeGuests(wid, guestIds, session));
  return { deleted };
}

/** Adds events to, and takes events from, many guests at once. */
export async function assignEvents(
  weddingId: string,
  input: { guestIds: string[]; add?: string[]; remove?: string[] },
): Promise<{ updated: number }> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const guestIds = await assertGuestsBelong(wid, input.guestIds);
  const add = await assertEventsBelong(wid, input.add ?? []);
  const remove = await assertEventsBelong(wid, input.remove ?? []);
  await inTransaction(async (session) => {
    // An event in both lists ends up added, because it is removed first.
    await unlinkEvents(wid, remove, session, guestIds);
    if (add.length > 0) {
      await Guest.updateMany(
        { weddingId: wid, _id: { $in: guestIds } },
        { $addToSet: { eventIds: { $each: add } } },
        { session },
      );
    }
  });
  return { updated: guestIds.length };
}

// ---- other reads ----

/** Households and how many guests each has, for the filter dropdown. */
export async function listHouseholds(weddingId: string): Promise<HouseholdItem[]> {
  await connectDb();
  const rows = await Guest.aggregate<{ _id: string; count: number }>([
    { $match: { weddingId: toObjectId(weddingId), household: { $exists: true, $ne: "" } } },
    { $group: { _id: "$household", count: { $sum: 1 } } },
  ]);
  return rows
    .map((r) => ({ name: r._id, count: r.count }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.name < b.name ? -1 : 1),
    );
}

/** True once the wedding has at least one guest (the dashboard's setup checklist). */
export async function hasGuests(weddingId: string): Promise<boolean> {
  await connectDb();
  return (await Guest.exists({ weddingId: toObjectId(weddingId) })) !== null;
}

/** Saves already-validated guests (the import). Each gets its own invitation token. */
export async function insertGuests(
  weddingId: string,
  rows: (GuestDetails & { eventIds: Types.ObjectId[] })[],
): Promise<number> {
  await connectDb();
  const wid = toObjectId(weddingId);
  if (rows.length === 0) return 0;
  const docs = rows.map((r) => ({
    name: r.name,
    ...(r.email ? { email: r.email } : {}),
    ...(r.phone ? { phone: r.phone } : {}),
    ...(r.relation ? { relation: r.relation } : {}),
    ...(r.household ? { household: r.household } : {}),
    eventIds: r.eventIds,
    weddingId: wid,
    ...newInviteToken(),
  }));
  const inserted = await Guest.insertMany(docs);
  return inserted.length;
}
