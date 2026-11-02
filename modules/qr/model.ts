import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// qrCodes. See "Tasks, QR codes and photos" in docs/database-design.md.

const qrCodeSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    // Empty for the whole-wedding code.
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    label: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    tokenHash: { type: String, required: true, select: false },
    // AES-256-GCM copy of the token, so the QR image can be drawn again for download.
    tokenEnc: { type: String, required: true, select: false },
    uploadsEnabled: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "qrCodes" },
);
qrCodeSchema.index({ tokenHash: 1 }, { unique: true });
qrCodeSchema.index({ weddingId: 1 });

export type QrCodeAttrs = InferSchemaType<typeof qrCodeSchema>;

export const QrCode =
  (models.QrCode as Model<QrCodeAttrs>) ?? model<QrCodeAttrs>("QrCode", qrCodeSchema);
