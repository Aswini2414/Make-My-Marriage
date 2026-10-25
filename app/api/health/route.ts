import { handler, json } from "@/lib/api";
import { connectDb } from "@/lib/db";

// Smoke test: confirms the app can reach MongoDB. Never returns error details.
export const GET = handler(async () => {
  try {
    const mongoose = await connectDb();
    await mongoose.connection.db?.admin().ping();
    return json({ ok: true, db: "up" });
  } catch (err) {
    console.error("[api] GET /api/health database check failed", err);
    return json({ ok: false, db: "down" }, 503);
  }
});
