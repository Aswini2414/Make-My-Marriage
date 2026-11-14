import "server-only";
import type { ClientSession, Types } from "mongoose";
import { todayIST } from "@/lib/dates";
import { connectDb, inTransaction, isDuplicateKey } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { assertUnderLimit, canLimitByIp, HOUR, MINUTE, recordHit, reserve } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { Guest } from "@/modules/guests/model";
import { Wedding } from "@/modules/weddings/model";
import { MAX_HEADCOUNT, Rsvp } from "./model";
import { type RsvpBody, TOKEN_PATTERN } from "./schema";

// What a guest can do with their personal link, no login. See "Guest-facing endpoints" in
// docs/api-design.md.
//
// Logging: never write a token, a link, or a guest's name, email or phone anywhere.

/** Saves per guest per hour (docs: rateLimits, `rsvp:<guestId>`). */
const SAVES_PER_HOUR = 20;
/** Lookups with an unknown link allowed per address in the window. Real use never misses. */
const MISSES = 20;
const MISS_WINDOW = 15 * MINUTE;

const notFound = () => new ApiError("LINK_NOT_FOUND");

/** Whether answers can still be changed: through the cut-off day itself (India time). */
export function isRsvpOpen(cutoff: string | null | undefined, today = todayIST()): boolean {
  return !cutoff || today <= cutoff;
}

/**
 * The guest a token belongs to, or LINK_NOT_FOUND. An unknown token and a regenerated one give
 * the same answer, and an address that keeps trying unknown links is slowed down. Only misses
 * are counted, so a family on one connection is never held back by its own visits.
 */
async function guestForToken(token: string, ip: string) {
  await connectDb();
  const limited = canLimitByIp(ip);
  const missKey = `invite-miss:ip:${ip}`;
  // The token is checked first: a working link is never held back by other people's mistakes
  // from the same address (a venue's Wi-Fi). Only an unknown link meets the limit.
  const guest = TOKEN_PATTERN.test(token)
    ? await Guest.findOne({ inviteTokenHash: hashToken(token) })
        .select("weddingId name eventIds inviteOpenedAt")
        .lean()
    : null;
  if (!guest) {
    if (limited) {
      await assertUnderLimit(missKey, MISSES, MISS_WINDOW);
      await recordHit(missKey, MISS_WINDOW);
    }
    throw notFound();
  }
  return guest;
}

/** Only the first visit writes; a later one finds the field already set. */
async function recordOpened(guest: { _id: Types.ObjectId; inviteOpenedAt?: Date | null }) {
  if (guest.inviteOpenedAt) return;
  await Guest.updateOne(
    { _id: guest._id, inviteOpenedAt: { $exists: false } },
    { $set: { inviteOpenedAt: new Date() } },
  );
}

/** The invitation page's browser code reports that the guest's browser has loaded it. */
export async function markInvitationOpened(token: string, ip: string): Promise<void> {
  await recordOpened(await guestForToken(token, ip));
}

export type PublicInvitation = {
  guest: { name: string };
  wedding: {
    brideName: string;
    groomName: string;
    weddingDate: string;
    slug: string;
    rsvpCutoffDate: string | null;
    rsvpOpen: boolean;
  };
  /** The most people one answer can bring; the page's stepper stops here. */
  maxHeadcount: number;
  /** Whether the invitation is recorded as opened (so the page need not report it again). */
  opened: boolean;
  events: {
    id: string;
    name: string;
    type: string;
    date: string;
    time: string;
    venueName: string;
    address?: string;
    mapLink?: string;
    dressCode?: string;
    rsvp: { attending: boolean; headcount: number; respondedAt: string } | null;
  }[];
};

/**
 * The guest's invitation: the couple, the date, and ONLY the events this guest is invited to,
 * with their current answers. Opening it for the first time records `inviteOpenedAt`, unless the
 * caller passes `markOpened: false`: the page renders on the server with that, so a mail
 * scanner that only fetches the HTML does not count as "opened"; the browser then calls the
 * API route once the page has loaded.
 */
export async function getInvitation(
  token: string,
  ip: string,
  { markOpened = true }: { markOpened?: boolean } = {},
): Promise<PublicInvitation> {
  const guest = await guestForToken(token, ip);
  const [wedding, events, answers] = await Promise.all([
    Wedding.findById(guest.weddingId)
      .select("brideName groomName weddingDate slug rsvpCutoffDate")
      .lean(),
    Event.find({ weddingId: guest.weddingId, _id: { $in: guest.eventIds } })
      .select("name type date time venueName address mapLink dressCode")
      .sort({ date: 1, time: 1, _id: 1 })
      .lean(),
    Rsvp.find({ weddingId: guest.weddingId, guestId: guest._id })
      .select("eventId attending headcount respondedAt")
      .lean(),
  ]);
  if (!wedding) throw notFound();

  if (markOpened) await recordOpened(guest);

  const byEvent = new Map(answers.map((a) => [String(a.eventId), a]));
  return {
    guest: { name: guest.name },
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      weddingDate: wedding.weddingDate,
      slug: wedding.slug,
      rsvpCutoffDate: wedding.rsvpCutoffDate ?? null,
      rsvpOpen: isRsvpOpen(wedding.rsvpCutoffDate),
    },
    maxHeadcount: MAX_HEADCOUNT,
    opened: markOpened || !!guest.inviteOpenedAt,
    events: events.map((e) => {
      const a = byEvent.get(String(e._id));
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
        rsvp: a
          ? {
              attending: a.attending,
              headcount: a.headcount,
              respondedAt: a.respondedAt.toISOString(),
            }
          : null,
      };
    }),
  };
}

const notInvited = () =>
  new ApiError("EVENT_NOT_INVITED", undefined, {
    fields: { answers: "You are not invited to one of those events." },
  });

/**
 * Saves the answers, replacing earlier ones, and returns how many were saved. All or nothing.
 * The answers and the guest's own record are written in one transaction, so a member deleting
 * the guest (or taking an event off them) at the same moment cannot leave an orphan answer.
 */
export async function saveAnswers(token: string, ip: string, body: RsvpBody): Promise<number> {
  const guest = await guestForToken(token, ip);
  // The place is taken first (safe when saves arrive together) and given back on any refusal,
  // so a closed form or a bad answer does not use up the guest's saves.
  const release = await reserve(`rsvp:${guest._id}`, SAVES_PER_HOUR, HOUR);
  try {
    const wedding = await Wedding.findById(guest.weddingId).select("rsvpCutoffDate").lean();
    if (!wedding) throw notFound();
    if (!isRsvpOpen(wedding.rsvpCutoffDate)) throw new ApiError("RSVP_CLOSED");

    // Two saves that reach a brand-new answer together can collide on the unique index; the
    // second one simply runs again and updates what the first created.
    for (let attempt = 0; ; attempt++) {
      try {
        return await inTransaction((session) =>
          writeAnswers(guest._id, guest.weddingId, body, session),
        );
      } catch (err) {
        if (!isDuplicateKey(err) || attempt >= 2) throw err;
      }
    }
  } catch (err) {
    // A failing give-back must not hide the real answer (403, 400…); the hit expires anyway.
    await release().catch(() => {});
    throw err;
  }
}

async function writeAnswers(
  guestId: Types.ObjectId,
  weddingId: Types.ObjectId,
  body: RsvpBody,
  session: ClientSession,
): Promise<number> {
  // Re-read inside the transaction: the guest may have been changed since the token lookup.
  const current = await Guest.findOne({ _id: guestId, weddingId })
    .select("eventIds")
    .session(session)
    .lean();
  if (!current) throw notFound();
  const invited = new Set(current.eventIds.map(String));
  if (body.answers.some((a) => !invited.has(String(toObjectId(a.eventId))))) throw notInvited();

  // Writing to the guest makes a concurrent delete or event change collide with this transaction.
  const touched = await Guest.updateOne(
    { _id: guestId, weddingId },
    { $currentDate: { updatedAt: true } },
    { session },
  );
  if (touched.matchedCount !== 1) throw notFound();

  const now = new Date();
  for (const a of body.answers) {
    await Rsvp.updateOne(
      { weddingId, guestId, eventId: toObjectId(a.eventId) },
      {
        $set: {
          weddingId,
          attending: a.attending,
          headcount: a.attending ? a.headcount! : 0,
          respondedAt: now,
        },
      },
      { upsert: true, session },
    );
  }
  return body.answers.length;
}

// ---- for members: a guest's answers ----

export type GuestAnswer = {
  eventId: string;
  attending: boolean;
  headcount: number;
  respondedAt: string;
};

/** The answers of these guests (one query), by guest id. For the guest list and the guest page. */
export async function answersForGuests(
  weddingId: Types.ObjectId,
  guestIds: Types.ObjectId[],
): Promise<Map<string, GuestAnswer[]>> {
  const byGuest = new Map<string, GuestAnswer[]>();
  if (guestIds.length === 0) return byGuest;
  const rows = await Rsvp.find({ weddingId, guestId: { $in: guestIds } })
    .select("guestId eventId attending headcount respondedAt")
    .sort({ respondedAt: 1, _id: 1 })
    .lean();
  for (const r of rows) {
    const list = byGuest.get(String(r.guestId)) ?? [];
    list.push({
      eventId: String(r.eventId),
      attending: r.attending,
      headcount: r.headcount,
      respondedAt: r.respondedAt.toISOString(),
    });
    byGuest.set(String(r.guestId), list);
  }
  return byGuest;
}
