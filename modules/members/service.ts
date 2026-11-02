import "server-only";
import bcrypt from "bcryptjs";
import mongoose, { type ClientSession, type Types } from "mongoose";
import { connectDb, isDuplicateKey } from "@/lib/db";
import { BCRYPT_COST } from "@/lib/passwords";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { sendMail } from "@/lib/mailer";
import { consume, DAY, HOUR } from "@/lib/rate-limit";
import { generateToken, hashToken } from "@/lib/tokens";
import { authResult, checkCredentials, type AuthResult } from "@/modules/auth/service";
import { User } from "@/modules/auth/model";
import { Wedding } from "@/modules/weddings/model";
import { memberInviteMail } from "./emails";
import { MemberInvite, Membership } from "./model";
import { newPassword, type AcceptInput, type InviteInput, type Role } from "./schema";

const INVITE_TTL_MS = 7 * DAY;
const INVITES_PER_HOUR = 20;

export type MemberView = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  isCreator: boolean;
  joinedAt: string | null;
};

export type InviteView = {
  id: string;
  name: string;
  email: string;
  role: Role;
  expiresAt: string;
};

/** Who is acting: the caller's wedding and account, both from the session. */
export type Actor = { weddingId: string; userId: string };

// ---------- listing ----------

export async function listMembers(
  weddingId: string,
  includeInvites: boolean,
): Promise<{ items: MemberView[]; pendingInvites?: InviteView[] }> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const [wedding, memberships] = await Promise.all([
    Wedding.findById(wid).select("createdBy").lean(),
    Membership.find({ weddingId: wid, status: "active" }).sort({ joinedAt: 1, _id: 1 }).lean(),
  ]);
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select("name email")
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const items: MemberView[] = memberships.flatMap((m) => {
    const user = byId.get(String(m.userId));
    if (!user) return [];
    return {
      id: String(m._id),
      userId: String(m.userId),
      name: user.name,
      email: user.email,
      role: m.role,
      isCreator: String(wedding?.createdBy) === String(m.userId),
      joinedAt: m.joinedAt?.toISOString() ?? null,
    };
  });
  if (!includeInvites) return { items };

  // The TTL index removes expired invites a little late, so filter here as well.
  const invites = await MemberInvite.find({
    weddingId: wid,
    acceptedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .lean();
  return { items, pendingInvites: invites.map(toInviteView) };
}

function toInviteView(i: {
  _id: unknown;
  name: string;
  email: string;
  role: Role;
  expiresAt: Date;
}): InviteView {
  return {
    id: String(i._id),
    name: i.name,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
  };
}

// ---------- invites ----------

async function weddingName(weddingId: Types.ObjectId): Promise<string> {
  const w = await Wedding.findById(weddingId).select("brideName groomName").lean();
  if (!w) throw new ApiError("NOT_FOUND");
  return `${w.brideName} & ${w.groomName}`;
}

async function inviterName(userId: string): Promise<string> {
  const u = await User.findById(toObjectId(userId)).select("name").lean();
  return u?.name ?? "A family member";
}

export async function inviteMember(actor: Actor, input: InviteInput): Promise<InviteView> {
  await connectDb();
  const wid = toObjectId(actor.weddingId);
  const now = new Date();

  const existing = await User.findOne({ email: input.email }).select("_id").lean();
  if (existing) {
    const membership = await Membership.findOne({ userId: existing._id, status: "active" })
      .select("weddingId")
      .lean();
    if (membership) {
      throw new ApiError(
        String(membership.weddingId) === actor.weddingId ? "ALREADY_MEMBER" : "IN_OTHER_WORKSPACE",
      );
    }
  }
  const elsewhere = await MemberInvite.exists({
    email: input.email,
    weddingId: { $ne: wid },
    acceptedAt: null,
    expiresAt: { $gt: now },
  });
  if (elsewhere) throw new ApiError("IN_OTHER_WORKSPACE");

  await consume(`invite:${actor.weddingId}`, INVITES_PER_HOUR, HOUR);

  const token = generateToken();
  const invite = await MemberInvite.create({
    weddingId: wid,
    name: input.name,
    email: input.email,
    role: input.role,
    tokenHash: hashToken(token),
    invitedBy: toObjectId(actor.userId),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
  });
  try {
    await sendMail(
      memberInviteMail({
        to: input.email,
        name: input.name,
        invitedBy: await inviterName(actor.userId),
        weddingName: await weddingName(wid),
        role: input.role,
        token,
      }),
    );
  } catch (err) {
    // No email went out, so there is nothing to wait for.
    await MemberInvite.deleteOne({ _id: invite._id });
    throw err;
  }
  // Inviting the same email again replaces the earlier link, so only one works at a time.
  await MemberInvite.deleteMany({
    weddingId: wid,
    email: input.email,
    acceptedAt: null,
    _id: { $ne: invite._id },
  });
  return toInviteView(invite);
}

export async function resendInvite(actor: Actor, inviteId: string): Promise<InviteView> {
  await connectDb();
  const wid = toObjectId(actor.weddingId);
  const invite = await MemberInvite.findOne({
    _id: toObjectId(inviteId),
    weddingId: wid,
    acceptedAt: null,
  }).select("+tokenHash");
  if (!invite) throw new ApiError("NOT_FOUND");

  await consume(`invite:${actor.weddingId}`, INVITES_PER_HOUR, HOUR);

  const previous = { tokenHash: invite.tokenHash, expiresAt: invite.expiresAt };
  const token = generateToken();
  invite.tokenHash = hashToken(token);
  invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await invite.save();
  try {
    await sendMail(
      memberInviteMail({
        to: invite.email,
        name: invite.name,
        invitedBy: await inviterName(actor.userId),
        weddingName: await weddingName(wid),
        role: invite.role,
        token,
      }),
    );
  } catch (err) {
    // Keep the old link working if the new one could not be sent.
    invite.tokenHash = previous.tokenHash;
    invite.expiresAt = previous.expiresAt;
    await invite.save();
    throw err;
  }
  return toInviteView(invite);
}

export async function cancelInvite(actor: Actor, inviteId: string): Promise<void> {
  await connectDb();
  const result = await MemberInvite.deleteOne({
    _id: toObjectId(inviteId),
    weddingId: toObjectId(actor.weddingId),
    acceptedAt: null,
  });
  if (result.deletedCount === 0) throw new ApiError("NOT_FOUND");
}

// ---------- accepting ----------

async function findOpenInvite(token: string) {
  return MemberInvite.findOne({
    tokenHash: hashToken(token),
    acceptedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
}

export type InviteInfo = {
  weddingName: string;
  /** YYYY-MM-DD */
  weddingDate: string;
  invitedBy: string;
  invitedName: string;
  email: string;
  role: Role;
  hasAccount: boolean;
};

export type InviteLookup = { status: "open" | "expired"; info: InviteInfo } | { status: "invalid" };

/**
 * What the accept page shows. An expired link is still described, so the page can say whose
 * wedding it was for; an unknown or already used link is just invalid.
 */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  await connectDb();
  const invite = await MemberInvite.findOne({
    tokenHash: hashToken(token),
    acceptedAt: null,
  }).lean();
  if (!invite) return { status: "invalid" };
  const [wedding, inviter, account] = await Promise.all([
    Wedding.findById(invite.weddingId).select("brideName groomName weddingDate").lean(),
    User.findById(invite.invitedBy).select("name").lean(),
    User.exists({ email: invite.email }),
  ]);
  if (!wedding) return { status: "invalid" };
  return {
    status: invite.expiresAt.getTime() > Date.now() ? "open" : "expired",
    info: {
      weddingName: `${wedding.brideName} & ${wedding.groomName}`,
      weddingDate: wedding.weddingDate,
      invitedBy: inviter?.name ?? "A family member",
      invitedName: invite.name,
      email: invite.email,
      role: invite.role,
      hasAccount: !!account,
    },
  };
}

/** For the API: TOKEN_INVALID for an unknown, expired or used link. */
export async function inviteInfo(token: string): Promise<InviteInfo> {
  const found = await lookupInvite(token);
  if (found.status !== "open") throw new ApiError("TOKEN_INVALID");
  return found.info;
}

/**
 * Turns an invite into a membership. A new email gets an account with the chosen password;
 * an existing account proves it with its password. Either way the person ends up logged in.
 */
export async function acceptInvite(input: AcceptInput, ip: string): Promise<AuthResult> {
  await connectDb();
  const invite = await findOpenInvite(input.token);
  if (!invite) throw new ApiError("TOKEN_INVALID");

  const account = await User.findOne({ email: invite.email }).select("_id").lean();
  let userId: Types.ObjectId | undefined;
  let passwordHash: string | undefined;
  if (account) {
    userId = (await checkCredentials(invite.email, input.password, ip))._id;
    if (await Membership.exists({ userId, status: "active" })) {
      throw new ApiError("IN_OTHER_WORKSPACE");
    }
  } else {
    const parsed = newPassword.safeParse(input.password);
    if (!parsed.success) {
      const message = parsed.error.issues[0]!.message;
      throw new ApiError("VALIDATION_FAILED", message, { fields: { password: message } });
    }
    passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  }

  const session = await mongoose.startSession();
  let finalUserId: Types.ObjectId | undefined;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      // Claim the link first, so two requests can't both use it.
      const claimed = await MemberInvite.findOneAndUpdate(
        { _id: invite._id, acceptedAt: null, expiresAt: { $gt: now } },
        { acceptedAt: now },
        { session },
      );
      if (!claimed) throw new ApiError("TOKEN_INVALID");
      let id = userId;
      if (!id) {
        const [created] = await User.create(
          [
            {
              name: input.name ?? invite.name,
              email: invite.email,
              passwordHash,
              lastLoginAt: now,
            },
          ],
          { session },
        );
        id = created!._id;
      } else {
        await User.updateOne({ _id: id }, { lastLoginAt: now }, { session });
      }
      await Membership.create(
        [
          {
            weddingId: invite.weddingId,
            userId: id,
            role: invite.role,
            invitedBy: invite.invitedBy,
            joinedAt: now,
          },
        ],
        { session },
      );
      // Invites to other weddings for this email can't be used any more.
      await MemberInvite.deleteMany(
        { email: invite.email, acceptedAt: null, _id: { $ne: invite._id } },
        { session },
      );
      finalUserId = id;
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      const keys = Object.keys((err as { keyPattern?: object }).keyPattern ?? {});
      throw keys.includes("email")
        ? new ApiError("EMAIL_TAKEN", "An account with this email already exists.")
        : new ApiError("IN_OTHER_WORKSPACE");
    }
    throw err;
  } finally {
    await session.endSession();
  }
  return authResult(String(finalUserId));
}

// ---------- changing and ending memberships ----------

/**
 * Runs a change to a wedding's members in a transaction that also touches the wedding
 * document. Two such changes at once then collide, and the loser runs again and sees the
 * winner's result. That is what keeps "at least one Admin" true when two Admins demote or
 * remove each other at the same moment.
 */
async function withMemberLock<T>(
  weddingId: Types.ObjectId,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  try {
    await session.withTransaction(async () => {
      await Wedding.updateOne(
        { _id: weddingId },
        { $currentDate: { updatedAt: true } },
        { session },
      );
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

async function activeAdmins(weddingId: Types.ObjectId, session: ClientSession) {
  return Membership.countDocuments({ weddingId, status: "active", role: "admin" }).session(session);
}

async function memberView(membershipId: Types.ObjectId, weddingId: Types.ObjectId) {
  const { items } = await listMembers(String(weddingId), false);
  const view = items.find((m) => m.id === String(membershipId));
  if (!view) throw new ApiError("NOT_FOUND");
  return view;
}

export async function changeRole(
  actor: Actor,
  membershipId: string,
  role: Role,
): Promise<MemberView> {
  await connectDb();
  const wid = toObjectId(actor.weddingId);
  const id = toObjectId(membershipId);
  await withMemberLock(wid, async (session) => {
    const target = await Membership.findOne({ _id: id, weddingId: wid, status: "active" }).session(
      session,
    );
    if (!target) throw new ApiError("NOT_FOUND");
    if (target.role === role) return;
    if (target.role === "admin" && (await activeAdmins(wid, session)) <= 1) {
      throw new ApiError("LAST_ADMIN");
    }
    target.role = role;
    await target.save({ session });
  });
  return memberView(id, wid);
}

/** Sets a membership to removed. The workspace creator can only be removed by themselves. */
async function endMembership(
  actor: Actor,
  filter: { _id?: Types.ObjectId; userId?: Types.ObjectId },
) {
  const wid = toObjectId(actor.weddingId);
  await withMemberLock(wid, async (session) => {
    const target = await Membership.findOne({
      ...filter,
      weddingId: wid,
      status: "active",
    }).session(session);
    if (!target) throw new ApiError("NOT_FOUND");
    const wedding = await Wedding.findById(wid).select("createdBy").session(session).lean();
    const isSelf = String(target.userId) === actor.userId;
    if (!isSelf && String(wedding?.createdBy) === String(target.userId)) {
      throw new ApiError(
        "CREATOR_PROTECTED",
        "The person who created the wedding can't be removed.",
      );
    }
    if (target.role === "admin" && (await activeAdmins(wid, session)) <= 1) {
      throw new ApiError("LAST_ADMIN");
    }
    target.status = "removed";
    target.removedAt = new Date();
    await target.save({ session });
  });
}

export async function removeMember(actor: Actor, membershipId: string): Promise<void> {
  await connectDb();
  await endMembership(actor, { _id: toObjectId(membershipId) });
}

export async function leaveWedding(actor: Actor): Promise<void> {
  await connectDb();
  await endMembership(actor, { userId: toObjectId(actor.userId) });
}
