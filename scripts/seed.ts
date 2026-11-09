// npm run db:seed — fills the development database with a sample wedding.
// Refuses to run when NODE_ENV=production, and against any database whose name doesn't end
// in "_dev". The first check happens before any connection is opened.
// Sample data is added module by module as each phase is built.
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import "@/lib/models";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production. db:seed is for development only.");
  }
  const conn = await connectDb();
  const dbName = conn.connection.name;
  if (!dbName.endsWith("_dev")) {
    throw new Error(`Refusing to seed "${dbName}". Point MONGODB_URI at mmm_dev.`);
  }
  console.log(`Seeding ${dbName}… nothing to seed yet (added from Phase 1).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
