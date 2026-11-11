import "server-only";
import type { ClientSession, Types } from "mongoose";
import { Guest } from "./model";

// Everything that points at a guest through a guestId.
//
// THE RULE: guests are deleted in ONE place, `removeGuests` below. The single delete, the bulk
// delete and anything later all call it, so a new module that points at guests adds its clean-up
// here, once. (Deleting a whole wedding is different: it removes whole collections in
// `deleteWedding`, modules/weddings/service.ts, and must add its own collections there too.)
// Follows "What a delete affects" in docs/database-design.md.

/**
 * Deletes the guests and everything that depends on them. Runs inside the caller's
 * transaction, so every write here must use `session`.
 */
export async function removeGuests(
  weddingId: Types.ObjectId,
  guestIds: Types.ObjectId[],
  session: ClientSession,
): Promise<number> {
  if (guestIds.length === 0) return 0;

  // Phase 4: delete these guests' rsvps ({ weddingId, guestId: { $in: guestIds } }) and take them
  //   out of invitationSends (guestIds, sentGuestIds, failedGuestIds).
  // Phase 5: clear guestId on their gifts ({ $unset: { guestId: 1 } }). The gift's giverName stays.

  const result = await Guest.deleteMany({ weddingId, _id: { $in: guestIds } }, { session });
  return result.deletedCount;
}

/**
 * Takes events out of guests. Used by the event delete (all guests) and by bulk "remove from
 * events". Phase 4: also delete the matching rsvps ({ guestId in guestIds, eventId in eventIds }).
 */
export async function unlinkEvents(
  weddingId: Types.ObjectId,
  eventIds: Types.ObjectId[],
  session: ClientSession,
  guestIds?: Types.ObjectId[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await Guest.updateMany(
    { weddingId, ...(guestIds ? { _id: { $in: guestIds } } : {}), eventIds: { $in: eventIds } },
    { $pull: { eventIds: { $in: eventIds } } },
    { session },
  );
}
