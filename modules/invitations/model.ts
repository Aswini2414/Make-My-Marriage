import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// invitationSends: one batched send of invitations or reminders, with its progress.
// See "invitationSends" in docs/database-design.md.

export const SEND_KINDS = ["invite", "reminder"] as const;
export const SEND_STATUSES = [
  "in_progress",
  "paused_daily_limit",
  "completed",
  "cancelled",
] as const;
export type SendKind = (typeof SEND_KINDS)[number];
export type SendStatus = (typeof SEND_STATUSES)[number];

const objectIds = { type: [Schema.Types.ObjectId], required: true, default: [] };

const sendSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    kind: { type: String, enum: SEND_KINDS, required: true },
    // The events the emails cover.
    eventIds: { ...objectIds, ref: "Event" },
    // Every guest to email, fixed when the send starts. Guests without an email are left out.
    guestIds: { ...objectIds, ref: "Guest" },
    sentGuestIds: { ...objectIds, ref: "Guest" },
    failedGuestIds: { ...objectIds, ref: "Guest" },
    status: { type: String, enum: SEND_STATUSES, required: true, default: "in_progress" },
    startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    completedAt: { type: Date },
    // Set for a minute while a batch is sending, so only one batch runs at a time.
    lockedUntil: { type: Date },
  },
  { timestamps: true, collection: "invitationSends" },
);
// Finding sends to resume.
sendSchema.index({ weddingId: 1, status: 1 });

export type SendAttrs = InferSchemaType<typeof sendSchema>;

export const InvitationSend =
  (models.InvitationSend as Model<SendAttrs>) ?? model<SendAttrs>("InvitationSend", sendSchema);
