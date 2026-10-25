import "server-only";
import mongoose from "mongoose";
import { coreEnv } from "@/lib/env";

// One Mongoose connection per server instance, kept on globalThis so Next.js dev reloads
// and Vercel's warm functions reuse it instead of opening a new one per request.

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

declare global {
  var mongooseCache: Cache | undefined;
}

const cache: Cache = (globalThis.mongooseCache ??= { conn: null, promise: null });

// Filters on fields that aren't in the schema are ignored rather than matching everything.
mongoose.set("strictQuery", true);

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(coreEnv().MONGODB_URI, {
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
