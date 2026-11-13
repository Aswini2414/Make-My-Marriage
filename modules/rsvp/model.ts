import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// rsvps: one guest's answer for one event. See "rsvps" in docs/database-design.md.
// A guest with no document for an event counts as "not replied".

/** The most people one answer can bring (docs: 1 to 20 when attending). */
export const MAX_HEADCOUNT = 20;

const rsvpSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    guestId: { type: Schema.Types.ObjectId, ref: "Guest", required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    attending: { type: Boolean, required: true },
    // 0 when not attending, otherwise 1 to MAX_HEADCOUNT.
    headcount: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_HEADCOUNT,
      validate: Number.isInteger,
    },
    respondedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "rsvps" },
);
// One answer per guest per event.
rsvpSchema.index({ guestId: 1, eventId: 1 }, { unique: true });
// Headcounts and RSVP counts per event.
rsvpSchema.index({ weddingId: 1, eventId: 1, attending: 1 });

export type RsvpAttrs = InferSchemaType<typeof rsvpSchema>;

export const Rsvp = (models.Rsvp as Model<RsvpAttrs>) ?? model<RsvpAttrs>("Rsvp", rsvpSchema);
