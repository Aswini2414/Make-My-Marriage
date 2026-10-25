// npm run db:indexes — creates every index declared in the Mongoose schemas.
// Run once per production deploy that adds an index. It only creates missing indexes;
// it never drops one (no syncIndexes), so nothing is removed by surprise.
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
