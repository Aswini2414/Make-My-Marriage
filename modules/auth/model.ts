import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// users and passwordResets. See "Accounts and members" in docs/database-design.md.

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    // bcrypt hash, cost 12. Never returned by any API.
    passwordHash: { type: String, required: true, select: false },
    lastLoginAt: { type: Date },
    // Sessions issued before this moment are no longer valid. Set on password reset and change.
    passwordChangedAt: { type: Date },
  },
  { timestamps: true, collection: "users" },
);
userSchema.index({ email: 1 }, { unique: true });

const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true, collection: "passwordResets" },
);
passwordResetSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type PasswordResetAttrs = InferSchemaType<typeof passwordResetSchema>;

export const User = (models.User as Model<UserAttrs>) ?? model<UserAttrs>("User", userSchema);
export const PasswordReset =
  (models.PasswordReset as Model<PasswordResetAttrs>) ??
  model<PasswordResetAttrs>("PasswordReset", passwordResetSchema);
