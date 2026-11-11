import "server-only";
import mongoose, { type Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Wedding } from "@/modules/weddings/model";
import { eventDependents, guestCounts, type RsvpCounts, rsvpCounts } from "./dependents";
import { type EventItem, IMPACT_KEYS, type Impact } from "./format";
import { Event, type EventAttrs } from "./model";
import {
  type CreateEventInput,
  DEFAULT_EVENT_TYPES,
  MAX_CUSTOM_EVENT_TYPES,
  type UpdateEventInput,
} from "./schema";

// Every function takes weddingId first and filters by it, so one wedding can never reach
// another's events. A missing id and another wedding's id both answer 404.

// The same shape the Events page uses, so the server and the browser cannot drift apart.
export type EventView = EventItem;

type EventDoc = EventAttrs & { _id: unknown };

function toEventView(e: EventDoc, guestCount: number): EventView {
  return {
    id: String(e._id),
    name: e.name,
    type: e.type,
    date: e.date,
    time: e.time,
    venueName: e.venueName,
    ...(e.address ? { address: e.address } : {}),
    ...(e.mapLink ? { mapLink: e.mapLink } : {}),
    ...(e.dressCode ? { dressCode: e.dressCode } : {}),
    ...(e.notes ? { notes: e.notes } : {}),
    ...(e.youtubeLink ? { youtubeLink: e.youtubeLink } : {}),
    guestCount,
  };
}

async function customTypesOf(wid: Types.ObjectId): Promise<string[]> {
  const wedding = await Wedding.findById(wid).select("customEventTypes").lean();
  if (!wedding) throw new ApiError("NOT_FOUND");
  return wedding.customEventTypes;
}

/** The type must be a default or one of this wedding's own custom types, spelled exactly. */
async function assertKnownType(wid: Types.ObjectId, type: string) {
  if ((DEFAULT_EVENT_TYPES as readonly string[]).includes(type)) return;
  if ((await customTypesOf(wid)).includes(type)) return;
  throw new ApiError("UNKNOWN_EVENT_TYPE", undefined, {
    fields: { type: "Choose one of the listed event types." },
  });
}

/** All events, in date then time order. */
export async function listEvents(weddingId: string): Promise<EventView[]> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const events = await Event.find({ weddingId: wid }).sort({ date: 1, time: 1, _id: 1 }).lean();
  const counts = await guestCounts(
    wid,
    events.map((e) => e._id),
  );
  return events.map((e) => toEventView(e, counts.get(String(e._id)) ?? 0));
}

/** The next events from `today` on (today included), in date and time order. */
export async function listUpcomingEvents(
  weddingId: string,
  today: string,
  limit: number,
): Promise<EventView[]> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const events = await Event.find({ weddingId: wid, date: { $gte: today } })
    .sort({ date: 1, time: 1, _id: 1 })
    .limit(limit)
    .lean();
  const counts = await guestCounts(
    wid,
    events.map((e) => e._id),
  );
  return events.map((e) => toEventView(e, counts.get(String(e._id)) ?? 0));
}

export async function createEvent(weddingId: string, input: CreateEventInput): Promise<EventView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  await assertKnownType(wid, input.type);
  const event = await Event.create({ ...input, weddingId: wid });
  return toEventView(event.toObject(), 0);
}

async function findEvent(wid: Types.ObjectId, id: string) {
  const event = await Event.findOne({ _id: toObjectId(id), weddingId: wid }).lean();
  if (!event) throw new ApiError("NOT_FOUND");
  return event;
}

export async function getEvent(
  weddingId: string,
  id: string,
): Promise<{ event: EventView; rsvp: RsvpCounts }> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const found = await findEvent(wid, id);
  const guestCount = (await guestCounts(wid, [found._id])).get(String(found._id)) ?? 0;
  return {
    event: toEventView(found, guestCount),
    rsvp: await rsvpCounts({ weddingId: wid, eventId: found._id }),
  };
}

export async function updateEvent(
  weddingId: string,
  id: string,
  input: UpdateEventInput,
): Promise<EventView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  // A missing event answers 404 before anything else is checked, as GET does.
  const eventId = (await findEvent(wid, id))._id;
  // Custom types can't be removed in v1, so a type that passes here stays valid for the write.
  if (input.type !== undefined) await assertKnownType(wid, input.type);

  // null clears an optional field.
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null) unset[key] = 1;
    else if (value !== undefined) set[key] = value;
  }
  const changes = {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
  const event = await Event.findOneAndUpdate({ _id: eventId, weddingId: wid }, changes, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  if (!event) throw new ApiError("NOT_FOUND");
  const guestCount = (await guestCounts(wid, [eventId])).get(String(eventId)) ?? 0;
  return toEventView(event, guestCount);
}

/**
 * What deleting the event would touch, for the confirmation. Every number comes from the
 * `count` of that module's entry in `eventDependents` (dependents.ts); `guests` is the real
 * number of guests invited. A module that points at events adds its count there, not here.
 */
export async function getDeleteImpact(weddingId: string, id: string): Promise<Impact> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const event = await findEvent(wid, id);
  const ids = { weddingId: wid, eventId: event._id };
  const counts = await Promise.all(IMPACT_KEYS.map((key) => eventDependents[key].count(ids)));
  return Object.fromEntries(IMPACT_KEYS.map((key, i) => [key, counts[i]])) as Impact;
}

/** Deletes the event and everything that points at it, in one transaction. */
export async function deleteEvent(weddingId: string, id: string): Promise<void> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const eventId = toObjectId(id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const deleted = await Event.findOneAndDelete({ _id: eventId, weddingId: wid }, { session });
      if (!deleted) throw new ApiError("NOT_FOUND");
      for (const key of IMPACT_KEYS) {
        await eventDependents[key].cleanup({ weddingId: wid, eventId }, session);
      }
    });
  } finally {
    await session.endSession();
  }
}

export type EventTypes = { default: string[]; custom: string[] };

export async function getEventTypes(weddingId: string): Promise<EventTypes> {
  await connectDb();
  return {
    default: [...DEFAULT_EVENT_TYPES],
    custom: await customTypesOf(toObjectId(weddingId)),
  };
}

/** Two type names are the same if they only differ by case (or Unicode composition). */
const sameType = (a: string, b: string) =>
  a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();

const MAX_TYPE_ATTEMPTS = 10;

/** Adds a custom type to this wedding's dropdown. Returns the updated custom list. */
export async function addEventType(weddingId: string, name: string): Promise<string[]> {
  await connectDb();
  const wid = toObjectId(weddingId);
  if (DEFAULT_EVENT_TYPES.some((t) => sameType(t, name))) throw new ApiError("TYPE_EXISTS");

  // The checks run here in JavaScript, so one rule decides what a duplicate is. The write only
  // goes through if the list is still exactly what was checked; if another request changed it
  // in between, read again and re-check. Two requests at once can't add a duplicate or go
  // past the limit.
  for (let attempt = 0; attempt < MAX_TYPE_ATTEMPTS; attempt++) {
    const custom = await customTypesOf(wid);
    if (custom.some((t) => sameType(t, name))) throw new ApiError("TYPE_EXISTS");
    if (custom.length >= MAX_CUSTOM_EVENT_TYPES) throw new ApiError("TOO_MANY_TYPES");
    const result = await Wedding.updateOne(
      { _id: wid, customEventTypes: custom },
      { $push: { customEventTypes: name } },
    );
    if (result.modifiedCount === 1) return [...custom, name];
  }
  throw new ApiError("SERVER_ERROR");
}
