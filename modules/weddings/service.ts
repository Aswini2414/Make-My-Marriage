import "server-only";
import { connectDb, inTransaction, isDuplicateKey } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { encryptToken, generateToken, hashToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { Guest } from "@/modules/guests/model";
import { MemberInvite, Membership } from "@/modules/members/model";
import { QrCode } from "@/modules/qr/model";
import { Task } from "@/modules/tasks/model";
import { Wedding, type WeddingAttrs } from "./model";
import type { CreateWeddingInput, UpdateWeddingInput } from "./schema";
import { baseSlug, isReservedSlug, slugCandidate } from "./slug";

export type WeddingView = {
  id: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  slug: string;
  theme: string;
  websitePublished: boolean;
  galleryEnabled: boolean;
  coverPhotoKey: string | null;
  rsvpCutoffDate: string | null;
};

type WeddingDoc = WeddingAttrs & { _id: unknown };

export function toWeddingView(w: WeddingDoc): WeddingView {
  return {
    id: String(w._id),
    brideName: w.brideName,
    groomName: w.groomName,
    weddingDate: w.weddingDate,
    slug: w.slug,
    theme: w.theme,
    websitePublished: w.websitePublished,
    galleryEnabled: w.galleryEnabled,
    coverPhotoKey: w.coverPhotoKey ?? null,
    rsvpCutoffDate: w.rsvpCutoffDate ?? null,
  };
}

const ALREADY_IN = "You're already part of a wedding workspace.";

// Another request can take the same address between our check and our write, so a lost
// race moves on to the next number.
const MAX_SLUG_TRIES = 50;

/**
 * Creates the wedding, the creator's Admin membership and the whole-wedding QR code
 * together: either all three exist afterwards or none do.
 */
export async function createWedding(
  userId: string,
  input: CreateWeddingInput,
): Promise<WeddingView> {
  await connectDb();
  const creator = toObjectId(userId);
  if (await Membership.exists({ userId: creator, status: "active" })) {
    throw new ApiError("ALREADY_IN_WORKSPACE", ALREADY_IN);
  }

  const base = baseSlug(input.brideName, input.groomName);
  for (let attempt = 0; attempt < MAX_SLUG_TRIES; attempt++) {
    const slug = slugCandidate(base, attempt);
    if (await Wedding.exists({ slug })) continue;

    try {
      return await inTransaction(async (session) => {
        const [wedding] = await Wedding.create([{ ...input, slug, createdBy: creator }], {
          session,
        });
        if (!wedding) throw new Error("Wedding was not created.");
        await Membership.create(
          [{ weddingId: wedding._id, userId: creator, role: "admin", joinedAt: new Date() }],
          { session },
        );
        const token = generateToken();
        await QrCode.create(
          [
            {
              weddingId: wedding._id,
              label: "Whole wedding",
              tokenHash: hashToken(token),
              tokenEnc: encryptToken(token),
            },
          ],
          { session },
        );
        return toWeddingView(wedding);
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Either the address was just taken (try the next one) or the user joined a wedding
      // from another tab (the partial unique index on memberships says so).
      if (await Membership.exists({ userId: creator, status: "active" })) {
        throw new ApiError("ALREADY_IN_WORKSPACE", ALREADY_IN);
      }
    }
  }
  throw new ApiError("SLUG_TAKEN", "Couldn't find a free website address. Try again.");
}

export async function getWedding(weddingId: string): Promise<WeddingView> {
  await connectDb();
  const wedding = await Wedding.findById(toObjectId(weddingId)).lean();
  if (!wedding) throw new ApiError("NOT_FOUND");
  return toWeddingView(wedding);
}

function assertSlugUsable(slug: string) {
  if (isReservedSlug(slug)) {
    throw new ApiError("SLUG_RESERVED", "That address is reserved. Try another.");
  }
}

/** The RSVP cut-off can't fall after the wedding itself. Checks the dates as they will be. */
async function assertCutoffNotAfterWedding(weddingId: string, input: UpdateWeddingInput) {
  if (input.weddingDate === undefined && input.rsvpCutoffDate === undefined) return;
  const current = await Wedding.findById(toObjectId(weddingId))
    .select("weddingDate rsvpCutoffDate")
    .lean();
  if (!current) throw new ApiError("NOT_FOUND");
  const date = input.weddingDate ?? current.weddingDate;
  const cutoff = input.rsvpCutoffDate === undefined ? current.rsvpCutoffDate : input.rsvpCutoffDate;
  if (cutoff && cutoff > date) {
    const field = input.rsvpCutoffDate === undefined ? "weddingDate" : "rsvpCutoffDate";
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { [field]: "The RSVP cut-off can't be after the wedding date." },
    });
  }
}

export async function updateWedding(
  weddingId: string,
  input: UpdateWeddingInput,
): Promise<WeddingView> {
  await connectDb();
  if (input.slug !== undefined) assertSlugUsable(input.slug);
  await assertCutoffNotAfterWedding(weddingId, input);
  const { rsvpCutoffDate, ...rest } = input;
  // null clears the cutoff date.
  const changes =
    rsvpCutoffDate === null
      ? { $set: rest, $unset: { rsvpCutoffDate: 1 } }
      : { $set: { ...rest, ...(rsvpCutoffDate ? { rsvpCutoffDate } : {}) } };
  try {
    const wedding = await Wedding.findByIdAndUpdate(toObjectId(weddingId), changes, {
      returnDocument: "after",
      runValidators: true,
    }).lean();
    if (!wedding) throw new ApiError("NOT_FOUND");
    return toWeddingView(wedding);
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError("SLUG_TAKEN", "That address is already used by another wedding.");
    }
    throw err;
  }
}

export type SlugCheck = { available: true } | { available: false; suggestion: string };

/** Whether another wedding already uses this address. The caller's own address is free. */
export async function checkSlug(weddingId: string, slug: string): Promise<SlugCheck> {
  await connectDb();
  assertSlugUsable(slug);
  const taken = await Wedding.exists({ slug, _id: { $ne: toObjectId(weddingId) } });
  if (!taken) return { available: true };
  for (let attempt = 1; attempt < MAX_SLUG_TRIES; attempt++) {
    const suggestion = slugCandidate(slug, attempt);
    if (!(await Wedding.exists({ slug: suggestion }))) return { available: false, suggestion };
  }
  return { available: false, suggestion: `${slug}-${Date.now().toString(36)}` };
}

/**
 * Deletes the wedding and everything that belongs to it, in one transaction. Memberships
 * are kept but set to removed, as docs/database-design.md says (Data lifecycle).
 *
 * Every module that adds a wedding-scoped collection must add its delete here, and the R2
 * files under weddings/<id>/ must be deleted after this commits (files module, Phase 8).
 *
 * Guests are deleted here by weddingId. When a later phase adds something that points at guests,
 * its whole collection goes here too: rsvps and invitationSends (Phase 4), gifts (Phase 5).
 * Deleting ONE guest is different and goes through `removeGuests` (modules/guests/dependents.ts).
 *
 * Deleting a single event is a different case: a module whose records point at an event
 * (guests, rsvps, expenses, gifts, tasks, vendors, photos) must unlink or delete them in
 * modules/events/dependents.ts, as well as being deleted here with the wedding.
 * Custom event types need nothing: they are weddings.customEventTypes and go with the wedding.
 */
export async function deleteWedding(weddingId: string, confirmSlug: string): Promise<void> {
  await connectDb();
  const wid = toObjectId(weddingId);
  await inTransaction(async (session) => {
    const wedding = await Wedding.findById(wid).select("slug").session(session).lean();
    if (!wedding) throw new ApiError("NOT_FOUND");
    if (wedding.slug !== confirmSlug) {
      throw new ApiError("VALIDATION_FAILED", undefined, {
        fields: { confirmSlug: "That doesn't match your website address." },
      });
    }
    await QrCode.deleteMany({ weddingId: wid }, { session });
    await Event.deleteMany({ weddingId: wid }, { session });
    await Guest.deleteMany({ weddingId: wid }, { session });
    await Task.deleteMany({ weddingId: wid }, { session });
    await MemberInvite.deleteMany({ weddingId: wid }, { session });
    await Membership.updateMany(
      { weddingId: wid, status: "active" },
      { status: "removed", removedAt: new Date() },
      { session },
    );
    await Wedding.deleteOne({ _id: wid }, { session });
  });
}
