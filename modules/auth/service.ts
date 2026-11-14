import "server-only";
import bcrypt from "bcryptjs";
import type { Types } from "mongoose";
import { connectDb, isDuplicateKey } from "@/lib/db";
import { BCRYPT_COST } from "@/lib/passwords";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { sendMail } from "@/lib/mailer";
import { assertUnderLimit, canLimitByIp, consume, HOUR, MINUTE, recordHit } from "@/lib/rate-limit";
import { generateToken, hashToken } from "@/lib/tokens";
import { Membership } from "@/modules/members/model";
import { Wedding } from "@/modules/weddings/model";
import { passwordResetMail } from "./emails";
import { PasswordReset, User } from "./model";
import type { SignupInput } from "./schema";

const RESET_TTL_MS = HOUR;
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * MINUTE;
const EMAIL_TAKEN_MSG = "An account with this email already exists.";

export type AuthUser = { id: string; name: string; email: string };
export type AuthWedding = { id: string; brideName: string; groomName: string; role: string };
export type AuthResult = { user: AuthUser; wedding: AuthWedding | null };

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

function toAuthUser(user: { _id: unknown; name: string; email: string }): AuthUser {
  return { id: String(user._id), name: user.name, email: user.email };
}

/** The user plus their one active wedding, in the shape login, me and signup return. */
export async function authResult(userId: string): Promise<AuthResult> {
  await connectDb();
  const user = await User.findById(toObjectId(userId)).select("name email").lean();
  if (!user) throw new ApiError("NOT_AUTHENTICATED");
  const membership = await Membership.findOne({ userId: user._id, status: "active" })
    .select("weddingId role")
    .lean();
  const wedding = membership
    ? await Wedding.findById(membership.weddingId).select("brideName groomName").lean()
    : null;
  return {
    user: toAuthUser(user),
    wedding:
      membership && wedding
        ? {
            id: String(wedding._id),
            brideName: wedding.brideName,
            groomName: wedding.groomName,
            role: membership.role,
          }
        : null,
  };
}

export async function signup(input: SignupInput, ip: string): Promise<AuthResult> {
  await connectDb();
  if (canLimitByIp(ip)) await consume(`signup:ip:${ip}`, 5, HOUR);
  if (await User.exists({ email: input.email })) throw new ApiError("EMAIL_TAKEN", EMAIL_TAKEN_MSG);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = await User.create({ name: input.name, email: input.email, passwordHash });
    return { user: toAuthUser(user), wedding: null };
  } catch (err) {
    // Two signups with one email at the same moment: the unique index decides.
    if (isDuplicateKey(err)) throw new ApiError("EMAIL_TAKEN", EMAIL_TAKEN_MSG);
    throw err;
  }
}

/**
 * Checks an email and password, counting failures against the login limits (5 per email
 * and 5 per IP in 15 minutes). Shared by login and by accepting an invite with an existing
 * account, so neither can be used to guess passwords faster than the other.
 */
export async function checkCredentials(
  email: string,
  password: string,
  ip: string,
): Promise<{ _id: Types.ObjectId; name: string; email: string }> {
  await connectDb();
  // Only failed attempts count: 5 per email and 5 per IP in 15 minutes.
  const keys = [`login:${email}`, ...(canLimitByIp(ip) ? [`login:ip:${ip}`] : [])];
  for (const key of keys) await assertUnderLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);

  const user = await User.findOne({ email }).select("+passwordHash name email").lean();
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    for (const key of keys) await recordHit(key, LOGIN_WINDOW_MS);
    throw new ApiError("INVALID_CREDENTIALS");
  }
  return user;
}

export async function login(email: string, password: string, ip: string): Promise<AuthResult> {
  const user = await checkCredentials(email, password, ip);
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  return authResult(String(user._id));
}

/** Emails a reset link when the account exists. Answers the same either way. */
export async function forgotPassword(email: string, ip: string): Promise<void> {
  await connectDb();
  // Every request for a real account sends an email from the shared daily email allowance, so one
  // address can't be used to burn it by looping over many emails.
  if (canLimitByIp(ip)) await consume(`forgot:ip:${ip}`, 10, HOUR);
  await consume(`forgot:${email}`, 3, HOUR);
  const user = await User.findOne({ email }).select("name email").lean();
  if (!user) return;

  // A new request replaces any earlier unused link.
  await PasswordReset.deleteMany({ userId: user._id, usedAt: null });
  const token = generateToken();
  await PasswordReset.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  try {
    await sendMail(passwordResetMail(user.email, user.name, token));
  } catch (err) {
    // A failure here (such as the daily email cap) must not show whether the account exists.
    console.error("[auth] password reset email failed", err instanceof Error ? err.message : err);
  }
}

export async function resetPassword(token: string, password: string): Promise<AuthResult> {
  await connectDb();
  // Slow work first, so a failure here leaves the link untouched.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // Claim the link, so two requests can't both use it.
  const reset = await PasswordReset.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
  ).lean();
  if (!reset) throw new ApiError("TOKEN_INVALID");
  try {
    // Ending older sessions: whoever knew the old password, or held a stolen session, is out.
    const { matchedCount } = await User.updateOne(
      { _id: reset.userId },
      { passwordHash, passwordChangedAt: new Date() },
    );
    if (!matchedCount) throw new ApiError("TOKEN_INVALID");
  } catch (err) {
    // The password wasn't changed, so the emailed link must keep working.
    await PasswordReset.updateOne({ _id: reset._id }, { usedAt: null });
    throw err;
  }
  return authResult(String(reset.userId));
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await connectDb();
  const user = await User.findById(toObjectId(userId)).select("+passwordHash").lean();
  if (!user) throw new ApiError("NOT_AUTHENTICATED");
  // Someone holding a stolen session must not be able to guess the password here.
  const key = `changepw:${userId}`;
  await assertUnderLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await recordHit(key, LOGIN_WINDOW_MS);
    throw new ApiError("INVALID_CREDENTIALS", "Your current password is incorrect.");
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await User.updateOne({ _id: user._id }, { passwordHash, passwordChangedAt: new Date() });
}
