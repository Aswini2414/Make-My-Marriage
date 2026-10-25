import { MongoMemoryReplSet } from "mongodb-memory-server";

// A real MongoDB in memory, run as a replica set so transactions work like on Atlas.
// Started once for the whole test run. The binary (~800 MB) downloads on first use and
// is cached afterwards.
//
// Set TEST_MONGODB_URI to use an existing replica set instead, such as a dedicated
// Atlas `mmm_test` database. Never point it at mmm_dev or mmm_prod: tests drop data.

let replSet: MongoMemoryReplSet | undefined;

export async function setup() {
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    if (!new URL(external).pathname.endsWith("_test")) {
      throw new Error("TEST_MONGODB_URI must point at a database whose name ends in _test");
    }
    process.env.MONGODB_URI = external;
    return;
  }
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("mmm_test");
}

export async function teardown() {
  await replSet?.stop();
}
