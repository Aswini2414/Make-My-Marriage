import "server-only";
import type { ClientSession, Types } from "mongoose";
import { QrCode } from "@/modules/qr/model";
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
  // Phase 3: pull the event out of guests.eventIds. Count = guests invited.
  guests: notBuiltYet,
  // Phase 4: delete the event's rsvps.
  rsvps: notBuiltYet,
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

/** Guests invited to each event, for `guestCount` on the event object. Phase 3 fills this in. */
export async function guestCounts(
  _weddingId: Types.ObjectId,
  eventIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  return new Map(eventIds.map((id) => [String(id), 0]));
}

export type RsvpCounts = {
  invited: number;
  attending: number;
  declined: number;
  notReplied: number;
  headcount: number;
};

/** RSVP counts for one event. Phase 4 fills this in (see "RSVP counts" in database-design.md). */
export async function rsvpCounts(ids: Ids): Promise<RsvpCounts> {
  void ids;
  return { invited: 0, attending: 0, declined: 0, notReplied: 0, headcount: 0 };
}
