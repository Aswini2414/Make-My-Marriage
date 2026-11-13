import "server-only";
import { connectDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { decryptToken, encryptToken, generateToken, hashToken } from "@/lib/tokens";
import { Guest } from "@/modules/guests/model";

// A guest's personal invitation link. The token is created with the guest (modules/guests); here
// a member can read the current link or replace it. Never log a token or a link.

/** The page address for a token. The website link in emails is built the same way. */
export function inviteLink(token: string): string {
  return `${appUrl()}/i/${token}`;
}

/** The guest's current link, to copy and share by hand. Another wedding's guest answers 404. */
export async function getGuestLink(weddingId: string, guestId: string): Promise<{ link: string }> {
  await connectDb();
  const guest = await Guest.findOne({ _id: toObjectId(guestId), weddingId: toObjectId(weddingId) })
    .select("+inviteTokenEnc")
    .lean();
  if (!guest) throw new ApiError("NOT_FOUND");
  return { link: inviteLink(decryptToken(guest.inviteTokenEnc)) };
}

/**
 * Replaces the guest's link. The old one stops working at once (its hash is gone), and the same
 * guest keeps their answers and reminder history. The invitation that was emailed now holds a
 * dead link, so the guest counts as not yet invited (decided in 4A): a "not sent" send reaches
 * them with the new one. Returns the new link.
 */
export async function regenerateGuestLink(
  weddingId: string,
  guestId: string,
): Promise<{ link: string }> {
  await connectDb();
  const token = generateToken();
  const result = await Guest.updateOne(
    { _id: toObjectId(guestId), weddingId: toObjectId(weddingId) },
    {
      $set: { inviteTokenHash: hashToken(token), inviteTokenEnc: encryptToken(token) },
      // The new link has not been opened, and the one that was emailed no longer works, so the
      // guest counts as not yet invited again (and the "not sent" filter finds them).
      $unset: { inviteOpenedAt: 1, lastInviteSentAt: 1 },
    },
  );
  if (result.matchedCount !== 1) throw new ApiError("NOT_FOUND");
  return { link: inviteLink(token) };
}
