import { formatDate, todayIST } from "@/lib/dates";
import type { PublicInvitation } from "./service";

// The logic of the guest invitation page (/i/<token>), kept apart from the components so it can be
// tested directly. Browser-safe: no database, no server-only imports (`import type` is erased).

export type InvitationData = PublicInvitation;
export type InvitationEvent = PublicInvitation["events"][number];

/** One event's answer in the form. `null` means the guest has not chosen yet. */
export type DraftAnswer = { attending: boolean; headcount: number } | null;
/** Event id → answer. */
export type Draft = Record<string, DraftAnswer>;

export type PageState = "invite" | "thanks" | "closed";

export { firstName } from "@/lib/names";

/** Nothing chosen yet. */
export function emptyDraft(events: InvitationEvent[]): Draft {
  return Object.fromEntries(events.map((e) => [e.id, null]));
}

/** The answers already saved on the server, as a form draft. */
export function draftFromEvents(events: InvitationEvent[]): Draft {
  return Object.fromEntries(
    events.map((e) => [
      e.id,
      e.rsvp ? { attending: e.rsvp.attending, headcount: Math.max(e.rsvp.headcount, 1) } : null,
    ]),
  );
}

/** How many of the events already have an answer saved on the server. */
export function savedAnswerCount(events: InvitationEvent[]): number {
  return events.filter((e) => e.rsvp).length;
}

/**
 * Which screen the server data calls for:
 * - closed: the cut-off has passed (read-only, whatever was answered);
 * - thanks: every event has an answer, so a returning guest sees the recap first;
 * - invite: otherwise, the form (pre-filled with whatever was answered).
 */
export function pageStateFor(data: Pick<InvitationData, "events" | "wedding">): PageState {
  if (!data.wedding.rsvpOpen) return "closed";
  if (data.events.length > 0 && savedAnswerCount(data.events) === data.events.length) {
    return "thanks";
  }
  return "invite";
}

/**
 * The draft after the invitation changed (an event added or removed): answers for events that
 * are still on it are kept, a new event starts unanswered, a removed one is dropped.
 */
export function reconcileDraft(events: InvitationEvent[], draft: Draft): Draft {
  const next = emptyDraft(events);
  for (const e of events) next[e.id] = draft[e.id] ?? null;
  return next;
}

/** The ids of the events with no answer, in page order. */
export function unanswered(events: InvitationEvent[], draft: Draft): string[] {
  return events.filter((e) => !draft[e.id]).map((e) => e.id);
}

/** Stays within 1 and `max`; anything that is not a number becomes 1. */
export function clampHeadcount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), Math.max(max, 1));
}

/** One step of the "People coming" control, kept within 1 and `max`. */
export function stepHeadcount(current: number, delta: 1 | -1, max: number): number {
  return clampHeadcount(current + delta, max);
}

/** Choosing Attending starts at 1 person (or keeps the count the guest had); Not attending clears it. */
export function chooseAnswer(draft: Draft, eventId: string, attending: boolean): Draft {
  const before = draft[eventId];
  return {
    ...draft,
    [eventId]: attending
      ? { attending: true, headcount: before?.attending ? before.headcount : 1 }
      : { attending: false, headcount: 0 },
  };
}

/** Sets the people count of an event that is marked Attending. */
export function setHeadcount(draft: Draft, eventId: string, value: number, max: number): Draft {
  const before = draft[eventId];
  if (!before?.attending) return draft;
  return { ...draft, [eventId]: { attending: true, headcount: clampHeadcount(value, max) } };
}

/** The body for POST /api/public/invite/:token/rsvp. Not attending carries no headcount. */
export function toPayload(events: InvitationEvent[], draft: Draft) {
  return {
    answers: events.flatMap((e) => {
      const a = draft[e.id];
      if (!a) return [];
      return [
        a.attending
          ? { eventId: e.id, attending: true, headcount: a.headcount }
          : { eventId: e.id, attending: false },
      ];
    }),
  };
}

/** "1 person", "2 people". */
export function peopleText(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** "Attending, 2 people", "Attending, 1 person", "Not attending". */
export function recapLine(answer: { attending: boolean; headcount: number }): string {
  if (!answer.attending) return "Not attending";
  return `Attending, ${peopleText(answer.headcount)}`;
}

/** "Attending (2 people)" for the closed page's list. */
export function closedLine(answer: { attending: boolean; headcount: number }): string {
  if (!answer.attending) return "Not attending";
  return `Attending (${peopleText(answer.headcount)})`;
}

/** "3 events" / "1 event". */
export function eventCountText(count: number): string {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

/** The day of the guest's latest save, in India time: "2 January 2027". Null before any save. */
export function lastSavedDate(events: InvitationEvent[]): string | null {
  const times = events.flatMap((e) => (e.rsvp ? [new Date(e.rsvp.respondedAt).getTime()] : []));
  if (times.length === 0) return null;
  return formatDate(todayIST(new Date(Math.max(...times))));
}

/** The map link, only when it is a plain https address (the API already stores only those). */
export function mapHref(link: string | undefined): string | undefined {
  if (!link) return undefined;
  try {
    const url = new URL(link);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Plain wording for a failed save. Never mentions the link. */
export function saveErrorMessage(code: string | undefined): string {
  switch (code) {
    case "RATE_LIMITED":
      return "Too many attempts. Please try again in a few minutes.";
    case "RSVP_CLOSED":
      return "Replies are now closed. Please contact the family.";
    case "EVENT_NOT_INVITED":
    case "LINK_NOT_FOUND":
      return "Your invitation has changed. We have updated this page; please check your answers.";
    case "VALIDATION_FAILED":
      return "Please check your answers and try again.";
    default:
      return "We could not save your reply. Please check your connection and try again.";
  }
}

/**
 * Whether the page itself answers "This link is not valid" (HTTP 404) for a lookup that failed
 * with this code. An address that has made too many bad lookups gets the same page, so the page
 * never tells a guest apart from a bad link by anything but the 404 they already see.
 */
export function showsNotValidPage(code: string | undefined): boolean {
  return code === "LINK_NOT_FOUND" || code === "RATE_LIMITED";
}

/** The "Incomplete reply" banner: after a try to send, for as long as an event has no answer. */
export function showIncompleteBanner(
  events: InvitationEvent[],
  draft: Draft,
  triedToSend: boolean,
): boolean {
  return triedToSend && unanswered(events, draft).length > 0;
}

/** Codes after which the page should read the invitation again. */
export function shouldRefresh(code: string | undefined): boolean {
  return code === "EVENT_NOT_INVITED" || code === "RSVP_CLOSED" || code === "LINK_NOT_FOUND";
}
