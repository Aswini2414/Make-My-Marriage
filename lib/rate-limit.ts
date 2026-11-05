import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, type ErrorCode } from "@/lib/errors";

// Rate limits live in the rateLimits collection, because Vercel keeps no memory between
// requests. One document per counted action. See "rateLimits" in docs/database-design.md.

const rateLimitSchema = new Schema(
  {
    key: { type: String, required: true },
    // When the record stops mattering. A TTL index deletes it after this time.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "rateLimits" },
);
rateLimitSchema.index({ key: 1, createdAt: 1 });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitAttrs = InferSchemaType<typeof rateLimitSchema>;
export const RateLimit =
  (models.RateLimit as Model<RateLimitAttrs>) ??
  model<RateLimitAttrs>("RateLimit", rateLimitSchema);

// Addresses that mean "this computer": local development, where every request would
// share one key and one person's mistakes would lock everyone out.
const LOCAL_ADDRESSES = new Set(["unknown", "::1", "127.0.0.1", "::ffff:127.0.0.1"]);

/**
 * False for local addresses outside production. In production they stay counted, so a
 * missing or odd header can't switch the limit off.
 */
export function canLimitByIp(ip: string): boolean {
  return !LOCAL_ADDRESSES.has(ip) || process.env.NODE_ENV === "production";
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Step 1 of a check: refuses when `limit` actions with this key happened inside the window.
 * Pass `code` to answer with another error code, such as EMAIL_CAP_REACHED.
 */
export async function assertUnderLimit(
  key: string,
  limit: number,
  windowMs: number,
  code: ErrorCode = "RATE_LIMITED",
): Promise<void> {
  await connectDb();
  const since = new Date(Date.now() - windowMs);
  // Newest `limit` hits; if there are that many, the oldest of them decides when we reopen.
  const hits = await RateLimit.find({ key, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("createdAt")
    .lean();
  if (hits.length < limit) return;
  const oldest = hits[hits.length - 1]!.createdAt as Date;
  const wait = Math.max(1, Math.ceil((oldest.getTime() + windowMs - Date.now()) / 1000));
  throw new ApiError(code, undefined, { retryAfterSeconds: wait });
}

/** Step 2 of a check: counts one action against the key. */
export async function recordHit(key: string, windowMs: number): Promise<void> {
  await connectDb();
  await RateLimit.create({ key, expiresAt: new Date(Date.now() + windowMs) });
}

/**
 * Takes one of `limit` places in the window, safely when many requests arrive together:
 * it records its own hit first and then counts, so two requests can't both see the last
 * free place. Returns a function that gives the place back (when the action then fails).
 */
export async function reserve(
  key: string,
  limit: number,
  windowMs: number,
  code: ErrorCode = "RATE_LIMITED",
): Promise<() => Promise<void>> {
  await connectDb();
  const hit = await RateLimit.create({ key, expiresAt: new Date(Date.now() + windowMs) });
  const release = async () => void (await RateLimit.deleteOne({ _id: hit._id }));
  const used = await RateLimit.countDocuments({
    key,
    createdAt: { $gte: new Date(Date.now() - windowMs) },
    // Only hits up to this one, so each request has its own place in line. Counting all of
    // them made every concurrent request near the limit see "over" and refuse together.
    _id: { $lte: hit._id },
  });
  if (used > limit) {
    await release();
    throw new ApiError(code, undefined, { retryAfterSeconds: 3600 });
  }
  return release;
}

/** Check, then count, for actions that always count (signup, forgot-password). */
export async function consume(key: string, limit: number, windowMs: number): Promise<void> {
  await assertUnderLimit(key, limit, windowMs);
  await recordHit(key, windowMs);
}
