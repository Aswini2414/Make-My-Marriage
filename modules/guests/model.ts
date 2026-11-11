import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// guests. See "Guests, RSVPs and invitations" in docs/database-design.md.
//
// "Invited to" is the embedded eventIds array, not a separate collection (database-design.md).
// There is no bride's or groom's side and no travel or accommodation field (PRD).

const guestSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    // Stored in one normalised form (modules/guests/phone.ts).
    phone: { type: String, trim: true, maxlength: 20 },
    relation: { type: String, trim: true, maxlength: 60 },
    // Free-text family group, such as "Rao family, Vizag".
    household: { type: String, trim: true, maxlength: 80 },
    eventIds: { type: [Schema.Types.ObjectId], ref: "Event", default: [] },
    // The personal invitation link. Created with the guest; sending and RSVP are Phase 4.
    inviteTokenHash: { type: String, required: true },
    inviteTokenEnc: { type: String, required: true, select: false },
    lastInviteSentAt: { type: Date },
    lastReminderSentAt: { type: Date },
    inviteOpenedAt: { type: Date },
  },
  { timestamps: true, collection: "guests" },
);
// The list sorts by name ignoring case, so this index carries the same collation: otherwise
// MongoDB cannot use it for that sort and sorts every page in memory. (An older plain
// { weddingId, name } index may still exist in a database; it is unused and can be dropped.)
guestSchema.index(
  { weddingId: 1, name: 1, _id: 1 },
  { name: "weddingId_1_name_1__id_1_en", collation: { locale: "en", strength: 2 } },
);
guestSchema.index({ weddingId: 1, createdAt: -1, _id: -1 });
// Not unique: the same email twice is a warning the member can confirm, not an error.
guestSchema.index(
  { weddingId: 1, email: 1 },
  { partialFilterExpression: { email: { $exists: true } } },
);
guestSchema.index({ weddingId: 1, eventIds: 1 });
guestSchema.index({ inviteTokenHash: 1 }, { unique: true });

export type GuestAttrs = InferSchemaType<typeof guestSchema>;

export const Guest = (models.Guest as Model<GuestAttrs>) ?? model<GuestAttrs>("Guest", guestSchema);
