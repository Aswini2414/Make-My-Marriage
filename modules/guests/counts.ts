import "server-only";
import type { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { toObjectId } from "@/lib/ids";
import { Guest } from "./model";

/**
 * How many guests are invited to each event, in one query. This is the ONE place the "N invited"
 * number comes from: the Events page, `GET /api/events/:id`, the dashboard's upcoming events
 * and the event-delete preview all go through it (docs/database-design.md, "Main queries").
 *
 * With `eventIds`, the answer has an entry for each of them (0 when nobody is invited).
 * Without, it has an entry for every event that has at least one guest.
 */
export async function invitedCountsByEvent(
  weddingId: string | Types.ObjectId,
  eventIds?: Types.ObjectId[],
): Promise<Map<string, number>> {
  await connectDb();
  const counts = new Map<string, number>((eventIds ?? []).map((id) => [String(id), 0]));
  if (eventIds && eventIds.length === 0) return counts;

  // aggregate() does not cast ids, so every one is converted here.
  const wid = toObjectId(weddingId);
  const wanted = eventIds?.map((id) => toObjectId(id));
  const rows = await Guest.aggregate<{ _id: Types.ObjectId; invited: number }>([
    { $match: { weddingId: wid, ...(wanted ? { eventIds: { $in: wanted } } : {}) } },
    { $unwind: "$eventIds" },
    ...(wanted ? [{ $match: { eventIds: { $in: wanted } } }] : []),
    { $group: { _id: "$eventIds", invited: { $sum: 1 } } },
  ]);
  for (const row of rows) counts.set(String(row._id), row.invited);
  return counts;
}
