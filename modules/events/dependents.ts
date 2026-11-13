import "server-only";
import type { ClientSession, Types } from "mongoose";
import { invitedCountsByEvent } from "@/modules/guests/counts";
import { unlinkEvents } from "@/modules/guests/dependents";
import { Guest } from "@/modules/guests/model";
import { InvitationSend } from "@/modules/invitations/model";
import { QrCode } from "@/modules/qr/model";
import { type RsvpCounts, rsvpCountsByEvent } from "@/modules/rsvp/counts";
import { Rsvp } from "@/modules/rsvp/model";
import { Task } from "@/modules/tasks/model";
import type { ImpactKey } from "./format";

// Everything in the app that points at an event through an eventId.
//
// THE RULE: any phase that adds a collection with an `eventId` (or guests' / vendors'
// `eventIds`) replaces its stub below with a real `count` and `cleanup`, following
// docs/database-design.md ("What a delete affects"). `getDeleteImpact` and `deleteEvent` in
// service.ts then pick it up with no change. Wedding delete is separate: it removes whole
// collections in `deleteWedding` (modules/weddings/service.ts).

type Ids = { weddingId: Types.ObjectId; eventId: Types.ObjectId };

export type EventDependent = {
  /** How many records the delete would touch (shown in the confirmation). */
  count(ids: Ids): Promise<number>;
  /** Unlinks or deletes them. Runs in the delete's transaction, so it must use `session`. */
  cleanup(ids: Ids, session: ClientSession): Promise<void>;
};

const notBuiltYet: EventDependent = {
  count: async () => 0,
  cleanup: async () => {},
};

export const eventDependents: Record<ImpactKey, EventDependent> = {
  // The event comes out of guests.eventIds (guests stay). Count = guests invited.
  guests: {
    count: ({ weddingId, eventId }) => Guest.countDocuments({ weddingId, eventIds: eventId }),
    cleanup: ({ weddingId, eventId }, session) => unlinkEvents(weddingId, [eventId], session),
  },
  // The event's answers go with it, and it comes out of the sends that covered it.
  rsvps: {
    count: ({ weddingId, eventId }) => Rsvp.countDocuments({ weddingId, eventId }),
    cleanup: async ({ weddingId, eventId }, session) => {
      await Rsvp.deleteMany({ weddingId, eventId }, { session });
      await InvitationSend.updateMany(
        { weddingId, eventIds: eventId },
        { $pull: { eventIds: eventId } },
        { session },
      );
    },
  },
  // Phase 5: clear eventId on expenses and on gifts.
  expenses: notBuiltYet,
  gifts: notBuiltYet,
  // Tasks are kept; only their link to the event is cleared.
  tasks: {
    count: ({ weddingId, eventId }) => Task.countDocuments({ weddingId, eventId }),
    cleanup: async ({ weddingId, eventId }, session) => {
      await Task.updateMany({ weddingId, eventId }, { $unset: { eventId: 1 } }, { session });
    },
  },
  // Phase 6: pull the event out of vendors.eventIds.
  vendors: notBuiltYet,
  // The event's own QR code goes with it.
  qrCodes: {
    count: ({ weddingId, eventId }) => QrCode.countDocuments({ weddingId, eventId }),
    cleanup: async ({ weddingId, eventId }, session) => {
      await QrCode.deleteMany({ weddingId, eventId }, { session });
    },
  },
  // Phase 8: photos keep their place with eventId cleared.
  photos: notBuiltYet,
};

/** Guests invited to each event, for `guestCount` on the event object. */
export function guestCounts(
  weddingId: Types.ObjectId,
  eventIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  return invitedCountsByEvent(weddingId, eventIds);
}

export type { RsvpCounts };

/** RSVP counts for one event, from the one counting function (modules/rsvp/counts.ts). */
export async function rsvpCounts({ weddingId, eventId }: Ids): Promise<RsvpCounts> {
  return (await rsvpCountsByEvent(weddingId, [eventId])).get(String(eventId))!;
}
