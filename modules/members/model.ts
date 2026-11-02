import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";
import { ROLES } from "./schema";

// memberships and memberInvites. See "Accounts and members" in docs/database-design.md.

export { ROLES };

const membershipSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
    // Memberships are never deleted. A pending invite lives in memberInvites until accepted.
    status: { type: String, enum: ["active", "removed"], required: true, default: "active" },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date },
    removedAt: { type: Date },
  },
  { timestamps: true, collection: "memberships" },
);
// One active workspace per person, enforced by the database.
membershipSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
membershipSchema.index({ weddingId: 1, status: 1, role: 1 });

const memberInviteSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, enum: ROLES, required: true },
    tokenHash: { type: String, required: true, select: false },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
  },
  { timestamps: true, collection: "memberInvites" },
);
memberInviteSchema.index({ tokenHash: 1 }, { unique: true });
memberInviteSchema.index({ email: 1, acceptedAt: 1 });
memberInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type MembershipAttrs = InferSchemaType<typeof membershipSchema>;
export type MemberInviteAttrs = InferSchemaType<typeof memberInviteSchema>;

export const Membership =
  (models.Membership as Model<MembershipAttrs>) ??
  model<MembershipAttrs>("Membership", membershipSchema);
export const MemberInvite =
  (models.MemberInvite as Model<MemberInviteAttrs>) ??
  model<MemberInviteAttrs>("MemberInvite", memberInviteSchema);
