import "server-only";
import mongoose, { type ClientSession } from "mongoose";
import { mongoUri } from "@/lib/env";

// One Mongoose connection per server instance, kept on globalThis so Next.js dev reloads
// and Vercel's warm functions reuse it instead of opening a new one per request.

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

declare global {
  var mongooseCache: Cache | undefined;
}

const cache: Cache = (globalThis.mongooseCache ??= { conn: null, promise: null });

// Filters on fields that aren't in the schema are ignored rather than matching everything.
mongoose.set("strictQuery", true);

/** Whether a MongoDB write failed on a unique index (error code 11000). */
export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(mongoUri(), {
    // Indexes are built automatically in development only; production uses `npm run db:indexes`.
    autoIndex: process.env.NODE_ENV === "development",
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}

/**
 * Runs `fn` in a transaction and returns what it returns. The one place a session is started and
 * ended. `fn` may run more than once (MongoDB retries a transaction that hit a write conflict),
 * so it must not do anything outside the database that cannot be repeated.
 */
export async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
