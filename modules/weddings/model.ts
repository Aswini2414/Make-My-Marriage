import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";
import { THEMES } from "./schema";

// weddings. See "Wedding and events" in docs/database-design.md.

export { THEMES };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

const weddingSchema = new Schema(
  {
    brideName: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    groomName: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    // YYYY-MM-DD. Drives the dashboard countdown.
    weddingDate: { type: String, required: true, match: DATE_PATTERN },
    coverPhotoKey: { type: String },
    slug: { type: String, required: true, minlength: 3, maxlength: 60, match: SLUG_PATTERN },
    theme: { type: String, enum: THEMES, required: true, default: "classic" },
    websitePublished: { type: Boolean, required: true, default: false },
    galleryEnabled: { type: Boolean, required: true, default: false },
    // After this YYYY-MM-DD date, RSVP answers become read-only.
    rsvpCutoffDate: { type: String, match: DATE_PATTERN },
    customEventTypes: {
      type: [{ type: String, trim: true, minlength: 1, maxlength: 40 }],
      required: true,
      default: [],
      validate: { validator: (v: string[]) => v.length <= 30, message: "At most 30 types." },
    },
    storageUsedBytes: { type: Number, required: true, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  },
  { timestamps: true, collection: "weddings" },
);
weddingSchema.index({ slug: 1 }, { unique: true });

export type WeddingAttrs = InferSchemaType<typeof weddingSchema>;

export const Wedding =
  (models.Wedding as Model<WeddingAttrs>) ?? model<WeddingAttrs>("Wedding", weddingSchema);
