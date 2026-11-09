// npm run db:indexes — creates every index declared in the Mongoose schemas.
// Needs only MONGODB_URI. A MONGODB_URI already set in the shell wins over .env.local, so
// against production run:  MONGODB_URI="mongodb+srv://…/mmm_prod" npm run db:indexes
// (PowerShell: $env:MONGODB_URI = "…"). The database name is printed first: check it.
// Run before the first signup, and again after any deploy that adds an index. It only
// creates missing indexes; it never drops one (no syncIndexes), so nothing is removed by surprise.
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import "@/lib/models";

async function main() {
  const conn = await connectDb();
  console.log(`Database: ${conn.connection.name}`);

  const names = mongoose.modelNames();
  if (names.length === 0) console.log("No models registered yet (see lib/models.ts).");

  for (const name of names) {
    await mongoose.model(name).createIndexes();
    console.log(`✓ ${name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
