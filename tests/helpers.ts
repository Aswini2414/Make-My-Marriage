import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { SignJWT } from "jose";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { User } from "@/modules/auth/model";
import { Membership } from "@/modules/members/model";
import { Wedding } from "@/modules/weddings/model";
import "@/lib/models";

export const APP = "http://localhost:3000";

/** Connects, builds every index once, and empties every collection. */
export async function resetDb() {
  const conn = await connectDb();
  for (const name of mongoose.modelNames()) {
    const m = mongoose.model(name);
    await m.createIndexes();
    await m.deleteMany({});
  }
  return conn;
}

export async function emptyDb() {
  for (const name of mongoose.modelNames()) await mongoose.model(name).deleteMany({});
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  userId?: string;
  /** Makes the session look this many seconds old, as if it had been issued earlier. */
  sessionAgeSeconds?: number;
  origin?: string | null;
  ip?: string;
  rawCookie?: string;
};

/** A request as the browser would send it: right Origin, JSON body, optional session cookie. */
export async function request(path: string, options: RequestOptions = {}) {
  const { method = "GET", body, userId, sessionAgeSeconds, origin = APP, ip, rawCookie } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (origin) headers.origin = origin;
  if (ip) headers["x-forwarded-for"] = ip;
  if (userId) {
    const token = sessionAgeSeconds
      ? await new SignJWT({})
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(userId)
          .setIssuedAt(Math.floor(Date.now() / 1000) - sessionAgeSeconds)
          .setExpirationTime("7d")
          .sign(new TextEncoder().encode(process.env.JWT_SECRET))
      : await signSession(userId);
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  if (rawCookie) headers.cookie = rawCookie;
  return new NextRequest(`${APP}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let sharedHash: string | undefined;
/** bcrypt at cost 12 is slow, so tests hash the shared password once. */
export const TEST_PASSWORD = "correct-horse-battery";
export async function testPasswordHash() {
  return (sharedHash ??= await bcrypt.hash(TEST_PASSWORD, 12));
}

export async function createUser(name = "Leela", email = "leela@example.com") {
  return User.create({ name, email, passwordHash: await testPasswordHash() });
}

/** A wedding with one active member of the given role. */
export async function createMember(
  role: "admin" | "manager",
  email = `${role}-${new Types.ObjectId().toHexString()}@example.com`,
  weddingId?: Types.ObjectId,
) {
  const user = await createUser(role, email);
  const wedding =
    weddingId ??
    (
      await Wedding.create({
        brideName: "Priya",
        groomName: "Ravi",
        weddingDate: "2027-02-14",
        slug: `priya-weds-ravi-${new Types.ObjectId().toHexString().slice(-6)}`,
        createdBy: user._id,
      })
    )._id;
  await Membership.create({ weddingId: wedding, userId: user._id, role, joinedAt: new Date() });
  return { user, weddingId: wedding };
}
