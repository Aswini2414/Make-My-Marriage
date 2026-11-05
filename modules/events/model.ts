import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// events. See "Wedding and events" in docs/database-design.md. Custom event types are not a
// collection: they live in weddings.customEventTypes.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const HTTPS = /^https:\/\//i; // a scheme is case-insensitive, and the Zod schema accepts "HTTPS://"

const eventSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    // A default type or one of the wedding's customEventTypes.
    type: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    // YYYY-MM-DD and HH:mm, kept apart. As fixed-width strings they sort correctly as text.
    date: { type: String, required: true, match: DATE_PATTERN },
    time: { type: String, required: true, match: TIME_PATTERN },
    venueName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 300 },
    mapLink: { type: String, trim: true, maxlength: 2000, match: HTTPS },
    dressCode: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 1000 },
    // Shown as the live stream on the wedding website.
    youtubeLink: { type: String, trim: true, maxlength: 2000, match: HTTPS },
  },
  { timestamps: true, collection: "events" },
);
eventSchema.index({ weddingId: 1, date: 1, time: 1 });

export type EventAttrs = InferSchemaType<typeof eventSchema>;

export const Event = (models.Event as Model<EventAttrs>) ?? model<EventAttrs>("Event", eventSchema);
