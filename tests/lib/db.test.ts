import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { connectDb } from "@/lib/db";

afterAll(() => mongoose.disconnect());

describe("database", () => {
  it("reuses one cached connection", async () => {
    const a = await connectDb();
    const b = await connectDb();
    expect(a).toBe(b);
    expect(a.connection.readyState).toBe(1);
  });

  it("supports transactions (replica set)", async () => {
    const conn = await connectDb();
    const session = await conn.startSession();
    await session.withTransaction(async () => {
      await conn.connection.db!.collection("smoke").insertOne({ ok: true }, { session });
    });
    await session.endSession();
    expect(await conn.connection.db!.collection("smoke").countDocuments()).toBe(1);
  });

  it("GET /api/health reports the database is up", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/health"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up" });
  });
});
