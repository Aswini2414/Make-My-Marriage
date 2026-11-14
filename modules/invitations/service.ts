import "server-only";
import type { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { DAILY_KEY, sendMail } from "@/lib/mailer";
import { DAY, HOUR, RateLimit, reserve } from "@/lib/rate-limit";
import { mailEnv } from "@/lib/env";
import { decryptToken } from "@/lib/tokens";
import { Event } from "@/modules/events/model";
import { Guest } from "@/modules/guests/model";
import { Rsvp } from "@/modules/rsvp/model";
import { isRsvpOpen } from "@/modules/rsvp/service";
import { Wedding } from "@/modules/weddings/model";
import { InvitationSend, type SendAttrs, type SendKind } from "./model";
import type { StartSendInput } from "./schema";
import { type EmailEvent, renderInvitationEmail, type RenderedEmail } from "./templates";
import { inviteLink } from "./token";

// Batched sending of invitations and reminders. The browser calls `nextBatch` in a loop; every
// piece of progress lives in the database, so a closed tab, a second member or the next day can
// carry on. See "Sending invitations in batches" in docs/system-design.md.
//
// Logging: ids and counts only. Never write an email address, a name, a token or a link, and
// never an SMTP error's message (it can quote the address).

/** Emails sent per call to `nextBatch` (docs: 20). */
export const BATCH_SIZE = 20;
/** How long one batch may hold the send. Renewed before and after every email. */
export const LOCK_MS = 60_000;
/** Test emails per wedding per hour (they use the shared daily budget). */
const TESTS_PER_HOUR = 10;

const ACTIVE = ["in_progress", "paused_daily_limit"] as const;

type SendDoc = SendAttrs & { _id: Types.ObjectId; createdAt?: Date };

export type SendView = {
  id: string;
  kind: SendKind;
  status: SendAttrs["status"];
  eventIds: string[];
  total: number;
  sent: number;
  failed: number;
  createdAt?: string;
  completedAt?: string;
};

const toView = (s: SendDoc): SendView => ({
  id: String(s._id),
  kind: s.kind,
  status: s.status,
  eventIds: s.eventIds.map(String),
  total: s.guestIds.length,
  sent: s.sentGuestIds.length,
  failed: s.failedGuestIds.length,
  ...(s.createdAt ? { createdAt: s.createdAt.toISOString() } : {}),
  ...(s.completedAt ? { completedAt: s.completedAt.toISOString() } : {}),
});

// ---- the daily cap ----

export type Quota = { cap: number; usedLast24h: number; remainingToday: number };

/** Emails the app sent in the last 24 hours (every kind), against the daily cap. */
export async function getQuota(): Promise<Quota> {
  await connectDb();
  const cap = mailEnv().EMAIL_DAILY_CAP;
  const usedLast24h = await RateLimit.countDocuments({
    key: DAILY_KEY,
    createdAt: { $gte: new Date(Date.now() - DAY) },
  });
  return { cap, usedLast24h, remainingToday: Math.max(0, cap - usedLast24h) };
}

// ---- building one guest's email ----

type WeddingForEmail = {
  brideName: string;
  groomName: string;
  weddingDate: string;
  slug: string;
  rsvpCutoffDate?: string | null;
};

function emailFor(
  kind: SendKind,
  wedding: WeddingForEmail,
  guest: { name: string; inviteTokenEnc: string },
  events: EmailEvent[],
): RenderedEmail {
  return renderInvitationEmail({
    kind,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    weddingDate: wedding.weddingDate,
    guestName: guest.name,
    ...(wedding.rsvpCutoffDate ? { replyBy: wedding.rsvpCutoffDate } : {}),
    events,
    // No website link until the wedding website exists (Phase 7): an email cannot be corrected
    // once sent. Phase 7 adds `websiteUrl` here, for published weddings only.
    inviteUrl: inviteLink(decryptToken(guest.inviteTokenEnc)),
  });
}

const EVENT_FIELDS = "name date time venueName address mapLink dressCode";

const toEmailEvent = (e: {
  name: string;
  date: string;
  time: string;
  venueName: string;
  address?: string | null;
  mapLink?: string | null;
  dressCode?: string | null;
}): EmailEvent => ({
  name: e.name,
  date: e.date,
  time: e.time,
  venueName: e.venueName,
  ...(e.address ? { address: e.address } : {}),
  ...(e.mapLink ? { mapLink: e.mapLink } : {}),
  ...(e.dressCode ? { dressCode: e.dressCode } : {}),
});

/**
 * For a reminder, only the events the guest has not answered yet: they need nothing more about the
 * others. An invitation lists every event the guest is invited to.
 */
async function eventsToList<T extends { _id: Types.ObjectId }>(
  kind: SendKind,
  wid: Types.ObjectId,
  guestId: Types.ObjectId,
  events: T[],
): Promise<T[]> {
  if (kind !== "reminder" || events.length === 0) return events;
  const answered = await Rsvp.find({
    weddingId: wid,
    guestId,
    eventId: { $in: events.map((e) => e._id) },
  })
    .select("eventId")
    .lean();
  const done = new Set(answered.map((a) => String(a.eventId)));
  return events.filter((e) => !done.has(String(e._id)));
}

async function loadGuestEmail(wid: Types.ObjectId, guestId: string, kind: SendKind) {
  const gid = toObjectId(guestId);
  const [wedding, guest] = await Promise.all([
    Wedding.findById(wid).select("brideName groomName weddingDate slug rsvpCutoffDate").lean(),
    Guest.findOne({ _id: gid, weddingId: wid })
      .select("+inviteTokenEnc name email eventIds")
      .lean(),
  ]);
  if (!wedding || !guest) throw new ApiError("NOT_FOUND");
  const events = await Event.find({ weddingId: wid, _id: { $in: guest.eventIds } })
    .select(EVENT_FIELDS)
    .sort({ date: 1, time: 1, _id: 1 })
    .lean();
  if (events.length === 0) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { guestId: "This guest is not invited to any event yet." },
    });
  }
  // A preview of a reminder for someone who has answered everything still shows their events.
  const unanswered = await eventsToList(kind, wid, gid, events);
  const listed = unanswered.length > 0 ? unanswered : events;
  return { guest, rendered: emailFor(kind, wedding, guest, listed.map(toEmailEvent)) };
}

/** The email a guest would receive, as HTML (docs: GET /api/invitations/preview). */
export async function previewEmail(weddingId: string, guestId: string, kind: SendKind) {
  await connectDb();
  const { rendered } = await loadGuestEmail(toObjectId(weddingId), guestId, kind);
  return { subject: rendered.subject, html: rendered.html };
}

/** Sends the preview to the member's own address. Counts toward the daily cap. */
export async function sendTestEmail(
  weddingId: string,
  memberEmail: string,
  guestId: string,
  kind: SendKind,
): Promise<{ ok: true }> {
  await connectDb();
  const { rendered } = await loadGuestEmail(toObjectId(weddingId), guestId, kind);
  // Every email uses a place in the one daily budget all weddings share, so a member can only
  // send a few tests an hour.
  const release = await reserve(`test-email:${weddingId}`, TESTS_PER_HOUR, HOUR);
  try {
    await sendMail({ to: memberEmail, ...rendered, subject: `[Test] ${rendered.subject}` });
  } catch (err) {
    await release().catch(() => {});
    throw err;
  }
  return { ok: true };
}

// ---- starting a send ----

/** The send, with how many guests were left out for having no email address (docs: inside `send`). */
export type StartedSend = { send: SendView & { skippedNoEmail: number } };

/**
 * Fixes the list of guests to email: those invited to at least one of the chosen events (or, with
 * none chosen, to any event), narrowed by the filter. A reminder keeps only guests who have not
 * answered at least one of their chosen events. Guests without an email are counted and left out.
 */
export async function startSend(
  weddingId: string,
  userId: string,
  input: StartSendInput,
): Promise<StartedSend> {
  await connectDb();
  const wid = toObjectId(weddingId);

  const weddingEvents = await Event.find({ weddingId: wid }).select("_id").lean();
  const known = new Set(weddingEvents.map((e) => String(e._id)));
  let eventIds: Types.ObjectId[];
  if (input.eventIds) {
    const unique = [...new Set(input.eventIds.map((id) => String(toObjectId(id))))];
    if (unique.some((id) => !known.has(id))) {
      throw new ApiError("VALIDATION_FAILED", undefined, {
        fields: { eventIds: "Choose events from this wedding." },
      });
    }
    eventIds = unique.map((id) => toObjectId(id));
  } else {
    eventIds = weddingEvents.map((e) => e._id);
  }
  if (eventIds.length === 0) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { eventIds: "Add an event first." },
    });
  }

  await assertNoActiveSend(wid);

  // Past the cut-off day guests can no longer reply, so an email asking them to would mislead.
  const w = await Wedding.findById(wid).select("rsvpCutoffDate").lean();
  if (w && !isRsvpOpen(w.rsvpCutoffDate)) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: {
        kind: "The RSVP cut-off has passed. Move the cut-off date in Settings to send more.",
      },
    });
  }

  const filter: Record<string, unknown> = { weddingId: wid, eventIds: { $in: eventIds } };
  const f = input.guestFilter;
  if (f?.guestIds) filter._id = { $in: f.guestIds.map((id) => toObjectId(id)) };
  if (f?.inviteStatus === "opened") filter.inviteOpenedAt = { $exists: true };
  if (f?.inviteStatus === "sent") {
    filter.lastInviteSentAt = { $exists: true };
    filter.inviteOpenedAt = { $exists: false };
  }
  if (f?.inviteStatus === "not_sent") {
    filter.lastInviteSentAt = { $exists: false };
    filter.inviteOpenedAt = { $exists: false };
  }
  let guests = await Guest.find(filter)
    .select("email eventIds")
    .sort({ name: 1, _id: 1 })
    .collation({ locale: "en", strength: 2 })
    .lean();

  // "Not replied" (always for a reminder): some chosen event of theirs has no answer yet.
  if (input.kind === "reminder" || f?.rsvpStatus === "not_replied") {
    const answered = await Rsvp.find({
      weddingId: wid,
      eventId: { $in: eventIds },
      guestId: { $in: guests.map((g) => g._id) },
    })
      .select("guestId eventId")
      .lean();
    const done = new Set(answered.map((a) => `${a.guestId}:${a.eventId}`));
    const chosen = new Set(eventIds.map(String));
    guests = guests.filter((g) =>
      g.eventIds.some((e) => chosen.has(String(e)) && !done.has(`${g._id}:${e}`)),
    );
  }

  const withEmail = guests.filter((g) => !!g.email);
  const skippedNoEmail = guests.length - withEmail.length;
  if (withEmail.length === 0) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { guestFilter: "There is no guest with an email address to send to." },
    });
  }

  const created = await InvitationSend.create({
    weddingId: wid,
    kind: input.kind,
    eventIds,
    guestIds: withEmail.map((g) => g._id),
    startedBy: toObjectId(userId),
    status: "in_progress",
  });
  // Two starts at the same moment can both pass the check above. The older one keeps the place.
  const first = await InvitationSend.findOne({ weddingId: wid, status: { $in: ACTIVE } })
    .sort({ _id: 1 })
    .select("_id")
    .lean();
  if (first && String(first._id) !== String(created._id)) {
    await InvitationSend.deleteOne({ _id: created._id });
    throw new ApiError("SEND_IN_PROGRESS");
  }
  return { send: { ...toView(created.toObject() as SendDoc), skippedNoEmail } };
}

async function assertNoActiveSend(wid: Types.ObjectId) {
  // A paused send counts too: it is only waiting for tomorrow.
  if (await InvitationSend.exists({ weddingId: wid, status: { $in: ACTIVE } })) {
    throw new ApiError("SEND_IN_PROGRESS");
  }
}

// ---- reading sends ----

async function findSend(wid: Types.ObjectId, id: string) {
  const send = await InvitationSend.findOne({ _id: toObjectId(id), weddingId: wid }).lean();
  if (!send) throw new ApiError("NOT_FOUND");
  return send as SendDoc;
}

export async function listSends(weddingId: string): Promise<{ items: SendView[] }> {
  await connectDb();
  const sends = await InvitationSend.find({ weddingId: toObjectId(weddingId) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(10)
    .lean();
  return { items: sends.map((s) => toView(s as SendDoc)) };
}

export async function getSend(weddingId: string, id: string) {
  await connectDb();
  const wid = toObjectId(weddingId);
  const send = await findSend(wid, id);
  const failed = send.failedGuestIds.length
    ? await Guest.find({ weddingId: wid, _id: { $in: send.failedGuestIds } })
        .select("name email")
        .sort({ name: 1, _id: 1 })
        .lean()
    : [];
  return {
    send: toView(send),
    failedGuests: failed.map((g) => ({
      id: String(g._id),
      name: g.name,
      ...(g.email ? { email: g.email } : {}),
    })),
  };
}

// ---- sending the next batch ----

export type BatchResult = { send: SendView; quota: { remainingToday: number } };

class LockLost extends Error {}

/**
 * Sends the next batch (up to BATCH_SIZE emails) and records progress. Only one batch of a send
 * runs at a time: the call first claims the send with an atomic update that succeeds only when no
 * unexpired claim exists, so two calls at once cannot email the same guest twice (the second
 * gets 409 SEND_BUSY). Progress is written after EVERY email, so even a crash mid-batch can
 * repeat at most the one email that was in flight.
 */
export async function nextBatch(weddingId: string, id: string): Promise<BatchResult> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const sendId = toObjectId(id);

  let lock = new Date(Date.now() + LOCK_MS);
  const claimed = await InvitationSend.findOneAndUpdate(
    {
      _id: sendId,
      weddingId: wid,
      status: { $in: ACTIVE },
      $or: [
        { lockedUntil: { $exists: false } },
        { lockedUntil: null },
        { lockedUntil: { $lte: new Date() } },
      ],
    },
    { $set: { lockedUntil: lock, status: "in_progress" } },
    { returnDocument: "after" },
  ).lean();

  if (!claimed) {
    const current = await findSend(wid, id); // 404 if it is not this wedding's
    if ((ACTIVE as readonly string[]).includes(current.status)) throw new ApiError("SEND_BUSY");
    // Finished or cancelled: nothing to send; report where it ended.
    return { send: toView(current), quota: await remaining() };
  }

  try {
    await runBatch(
      claimed as SendDoc,
      wid,
      () => lock,
      (next) => (lock = next),
    );
  } catch (err) {
    if (!(err instanceof LockLost)) {
      await releaseLock(sendId, lock);
      throw err;
    }
  }
  await releaseLock(sendId, lock);
  return { send: toView(await findSend(wid, id)), quota: await remaining() };
}

const remaining = async () => ({ remainingToday: (await getQuota()).remainingToday });

const releaseLock = (id: Types.ObjectId, lock: Date) =>
  InvitationSend.updateOne({ _id: id, lockedUntil: lock }, { $unset: { lockedUntil: 1 } });

async function runBatch(
  send: SendDoc,
  wid: Types.ObjectId,
  getLock: () => Date,
  setLock: (next: Date) => void,
) {
  const done = new Set([...send.sentGuestIds, ...send.failedGuestIds].map(String));
  const pending = send.guestIds.filter((g) => !done.has(String(g)));
  if (pending.length === 0) return finish(send._id);

  const quota = (await getQuota()).remainingToday;
  if (quota <= 0) return pause(send._id);
  const batch = pending.slice(0, Math.min(BATCH_SIZE, quota));

  const [wedding, events] = await Promise.all([
    Wedding.findById(wid).select("brideName groomName weddingDate slug rsvpCutoffDate").lean(),
    Event.find({ weddingId: wid, _id: { $in: send.eventIds } })
      .select(EVENT_FIELDS)
      .sort({ date: 1, time: 1, _id: 1 })
      .lean(),
  ]);
  if (!wedding) throw new ApiError("NOT_FOUND");
  // Every event the send covered has been deleted: there is nothing left to invite anyone to.
  if (events.length === 0) return cancelled(send._id);

  /** Writes progress under the claim; a lost claim means someone else took over: stop. */
  const record = async (update: Record<string, unknown>) => {
    const next = new Date(Date.now() + LOCK_MS);
    const res = await InvitationSend.updateOne(
      { _id: send._id, lockedUntil: getLock(), status: "in_progress" },
      { ...update, $set: { lockedUntil: next } },
    );
    if (res.matchedCount !== 1) throw new LockLost();
    setLock(next);
  };

  let capReached = false;
  for (const gid of batch) {
    // Read just before sending, so a link regenerated a moment ago is the one that goes out.
    const guest = await Guest.findOne({ _id: gid, weddingId: wid })
      .select("+inviteTokenEnc name email eventIds")
      .lean();
    const invited = guest
      ? events.filter((e) => guest.eventIds.some((id) => String(id) === String(e._id)))
      : [];
    // A reminder lists only what the guest has not answered, read now, so a reply sent a moment
    // ago is not asked for again.
    const mine = guest ? await eventsToList(send.kind, wid, gid, invited) : [];
    // A guest deleted since the send started, taken off every event of it, or (for a reminder)
    // who has answered everything since, is simply passed over: nothing to send, nothing failed.
    if (!guest || mine.length === 0) {
      await record({ $pull: { guestIds: gid } });
      continue;
    }
    if (!guest.email) {
      await record({ $addToSet: { failedGuestIds: gid } });
      continue;
    }
    // A fresh minute for this email (the transport gives up well before that).
    await record({});
    try {
      const mail = emailFor(send.kind, wedding, guest, mine.map(toEmailEvent));
      await sendMail({ to: guest.email, ...mail });
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_CAP_REACHED") {
        capReached = true;
        break;
      }
      // Ids and an error code only: the message may quote the address.
      console.error(
        `[invitations] send ${send._id} guest ${gid} failed`,
        (err as { code?: string }).code ?? "ERROR",
      );
      await record({ $addToSet: { failedGuestIds: gid } });
      continue;
    }
    // Progress first, the guest's own dates second: a crash between them can only lose a date,
    // never cause a second email.
    await record({ $addToSet: { sentGuestIds: gid } });
    const now = new Date();
    await Guest.updateOne(
      { _id: gid, weddingId: wid },
      send.kind === "invite"
        ? { $set: { lastInviteSentAt: now } }
        : { $set: { lastReminderSentAt: now }, $inc: { reminderCount: 1 } },
    );
  }

  const after = (await InvitationSend.findById(send._id)
    .select("guestIds sentGuestIds failedGuestIds status")
    .lean())!;
  const handled = new Set([...after.sentGuestIds, ...after.failedGuestIds].map(String));
  const left = after.guestIds.some((g) => !handled.has(String(g)));
  if (after.status !== "in_progress") return; // cancelled while this batch ran
  if (!left) return finish(send._id);
  if (capReached || (await getQuota()).remainingToday <= 0) return pause(send._id);
}

const finish = (id: Types.ObjectId) =>
  InvitationSend.updateOne(
    { _id: id, status: "in_progress" },
    { $set: { status: "completed", completedAt: new Date() } },
  );

const cancelled = (id: Types.ObjectId) =>
  InvitationSend.updateOne({ _id: id, status: "in_progress" }, { $set: { status: "cancelled" } });

const pause = (id: Types.ObjectId) =>
  InvitationSend.updateOne(
    { _id: id, status: "in_progress" },
    { $set: { status: "paused_daily_limit" } },
  );

// ---- retry and cancel ----

/** Puts the failed guests back in the queue and opens the send again. */
export async function retryFailed(weddingId: string, id: string): Promise<{ send: SendView }> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const send = await findSend(wid, id);
  if (send.status === "cancelled") {
    throw new ApiError("VALIDATION_FAILED", "That send was cancelled. Start a new one.");
  }
  if (send.status === "completed") {
    // Opening a finished send again must not run beside another one.
    await assertNoActiveSend(wid);
  }
  const updated = await InvitationSend.findOneAndUpdate(
    { _id: send._id, weddingId: wid, status: { $ne: "cancelled" } },
    { $set: { failedGuestIds: [], status: "in_progress" }, $unset: { completedAt: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new ApiError("NOT_FOUND");
  return { send: toView(updated as SendDoc) };
}

/** Stops a send that is in progress or paused. Cancelling a finished one changes nothing. */
export async function cancelSend(weddingId: string, id: string): Promise<{ send: SendView }> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const send = await findSend(wid, id);
  if (!(ACTIVE as readonly string[]).includes(send.status)) return { send: toView(send) };
  const updated = await InvitationSend.findOneAndUpdate(
    { _id: send._id, weddingId: wid, status: { $in: ACTIVE } },
    { $set: { status: "cancelled" }, $unset: { lockedUntil: 1 } },
    { returnDocument: "after" },
  ).lean();
  return { send: toView((updated ?? send) as SendDoc) };
}
