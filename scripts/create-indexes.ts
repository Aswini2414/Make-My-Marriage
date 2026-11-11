// npm run db:indexes — creates every index declared in the Mongoose schemas.
// Needs only MONGODB_URI. A MONGODB_URI already set in the shell wins over .env.local, so
// against production run:  MONGODB_URI="mongodb+srv://…/mmm_prod" npm run db:indexes
// (PowerShell: $env:MONGODB_URI = "…"). The database name is printed first: check it.
// Run before the first signup, and again after any deploy that adds an index. It only
// creates missing indexes; it never drops one (no syncIndexes), so nothing is removed by surprise.
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import "@/lib/models";

// 85 = same keys under another name, 86 = same name with different options, 11000 = existing data
// breaks a unique index. The usual cause is an index from an earlier version of the schema.
function explain(model: string, err: unknown): string {
  const e = err as { code?: number; codeName?: string; message?: string };
  if (e.code === 85 || e.code === 86) {
    const guests =
      model === "Guest"
        ? ' For guests this is the old UNIQUE email index: drop "weddingId_1_email_1" on the guests collection (it is now a plain index, because a repeated email is a warning), then run this again.'
        : "";
    return `an existing index clashes with the one in the code (${e.codeName}). Drop the old index, then run this again.${guests}`;
  }
  if (e.code === 11000) {
    return "existing documents break a unique index, so it cannot be built. Fix or remove the duplicates first.";
  }
  return e.message ?? String(err);
}

async function main() {
  const conn = await connectDb();
  console.log(`Database: ${conn.connection.name}`);

  const names = mongoose.modelNames();
  if (names.length === 0) console.log("No models registered yet (see lib/models.ts).");

  let failed = 0;
  for (const name of names) {
    try {
      await mongoose.model(name).createIndexes();
      console.log(`✓ ${name}`);
    } catch (err) {
      // Keep going: one clashing index must not leave the other collections without theirs.
      failed++;
      console.error(`✗ ${name}: ${explain(name, err)}`);
    }
  }
  if (failed > 0) {
    console.error(`
${failed} collection(s) could not be indexed (see above). The rest are done.`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
