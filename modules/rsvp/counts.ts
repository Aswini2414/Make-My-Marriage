import "server-only";
import type { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { toObjectId } from "@/lib/ids";
import { invitedCountsByEvent } from "@/modules/guests/counts";
import { Guest } from "@/modules/guests/model";
import { Rsvp } from "./model";

// The ONE place RSVP numbers are worked out (docs/database-design.md, "RSVP counts and headcount
// per event"). The event page and delete preview, the Events list, the dashboard card and, later,
// the Invitations page all read from here.

export type RsvpCounts = {
  /** Guests invited to the event. */
  invited: number;
  /** Guests who said yes. */
  attending: number;
  /** Guests who said no. */
  declined: number;
  /** Invited guests with no answer yet. */
  notReplied: number;
  /** People coming (the sum of the headcounts of the guests who said yes). */
  headcount: number;
};

const empty = (): RsvpCounts => ({
  invited: 0,
  attending: 0,
  declined: 0,
  notReplied: 0,
  headcount: 0,
});

/**
 * Counts for each of `eventIds` (an entry for every one, zeros when nobody is invited), or for
 * every event of the wedding that has a guest or an answer when `eventIds` is left out.
 */
export async function rsvpCountsByEvent(
  weddingId: string | Types.ObjectId,
  eventIds?: Types.ObjectId[],
): Promise<Map<string, RsvpCounts>> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const wanted = eventIds?.map((id) => toObjectId(id));
  const result = new Map<string, RsvpCounts>((wanted ?? []).map((id) => [String(id), empty()]));
  if (wanted && wanted.length === 0) return result;

  const [invited, rows] = await Promise.all([
    invitedCountsByEvent(wid, wanted),
    // aggregate() does not cast ids, so they were converted above.
    Rsvp.aggregate<{ _id: Types.ObjectId; attending: number; declined: number; headcount: number }>(
      [
        { $match: { weddingId: wid, ...(wanted ? { eventId: { $in: wanted } } : {}) } },
        {
          $group: {
            _id: "$eventId",
            attending: { $sum: { $cond: ["$attending", 1, 0] } },
            declined: { $sum: { $cond: ["$attending", 0, 1] } },
            headcount: { $sum: "$headcount" },
          },
        },
      ],
    ),
  ]);

  const at = (id: string) => {
    let c = result.get(id);
    if (!c) result.set(id, (c = empty()));
    return c;
  };
  for (const [id, n] of invited) at(id).invited = n;
  for (const r of rows) {
    const c = at(String(r._id));
    c.attending = r.attending;
    c.declined = r.declined;
    c.headcount = r.headcount;
  }
  for (const c of result.values()) c.notReplied = Math.max(0, c.invited - c.attending - c.declined);
  return result;
}

export type RsvpOverall = {
  invited: number;
  attending: number;
  declined: number;
  notReplied: number;
};

/**
 * Each guest counted once (docs, dashboard): attending if coming to at least one event, declined
 * if they said no to everything they answered, not replied if they have answered nothing.
 * Only guests invited to at least one event are counted.
 */
export async function rsvpOverall(weddingId: string | Types.ObjectId): Promise<RsvpOverall> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const [invited, answered] = await Promise.all([
    Guest.countDocuments({ weddingId: wid, "eventIds.0": { $exists: true } }),
    Rsvp.aggregate<{ _id: null; attending: number; declined: number }>([
      { $match: { weddingId: wid } },
      { $group: { _id: "$guestId", yes: { $max: { $cond: ["$attending", 1, 0] } } } },
      {
        $group: {
          _id: null,
          attending: { $sum: "$yes" },
          declined: { $sum: { $subtract: [1, "$yes"] } },
        },
      },
    ]),
  ]);
  const attending = answered[0]?.attending ?? 0;
  const declined = answered[0]?.declined ?? 0;
  return { invited, attending, declined, notReplied: Math.max(0, invited - attending - declined) };
}
