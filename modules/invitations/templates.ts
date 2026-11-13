import { formatDate, formatDateWithDay, formatTime12 } from "@/lib/dates";
import { escapeHtml, oneLine, safeHref } from "@/lib/html";
import type { Mail } from "@/lib/mailer";
import type { SendKind } from "./model";

// The invitation and reminder emails: plain, English only, one template for every guest.
// Every value a member typed (names, venue, address, dress code) goes through escapeHtml, and a
// map link is used only when it is a real https:// address. Pure functions: no database, no
// environment, so the tests can call them directly. No tracking pixel: "opened" is the guest
// opening their own link (docs/api-design.md).

export type EmailEvent = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  venueName: string;
  address?: string;
  mapLink?: string;
  dressCode?: string;
};

export type InvitationEmailInput = {
  kind: SendKind;
  brideName: string;
  groomName: string;
  guestName: string;
  /** The RSVP cut-off day (YYYY-MM-DD), when the couple set one. */
  replyBy?: string;
  /** Only the events this guest is invited to, in date order. */
  events: EmailEvent[];
  /** The wedding website. Left out of the email until the site exists (Phase 7). */
  websiteUrl?: string;
  /** The guest's personal invitation link. */
  inviteUrl: string;
};

export type RenderedEmail = Pick<Mail, "subject" | "html" | "text">;

function eventLines(e: EmailEvent) {
  const when = `${formatDateWithDay(e.date)} at ${formatTime12(e.time)}`;
  const where = [e.venueName, e.address].filter(Boolean).join(", ");
  const map = safeHref(e.mapLink);
  return { when, where, map, dress: e.dressCode };
}

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const couple = `${input.brideName} and ${input.groomName}`;
  const reminder = input.kind === "reminder";
  const subject = oneLine(
    reminder
      ? `Reminder: please reply to the invitation to the wedding of ${couple}`
      : `You're invited to the wedding of ${couple}`,
  );
  const intro = reminder
    ? `This is a friendly reminder. ${couple} would love to know if you can join them. Please tell them which events you will come to.`
    : `${couple} are getting married and would love to have you with them.`;
  const by = input.replyBy ? `Please reply by ${formatDate(input.replyBy)}.` : "";
  const call = reminder ? "Reply to the invitation" : "See your invitation and reply";

  const text = [
    `Dear ${input.guestName},`,
    "",
    intro,
    "",
    input.events.length === 1 ? "You are invited to:" : "You are invited to these events:",
    ...input.events.flatMap((e) => {
      const { when, where, map, dress } = eventLines(e);
      return [
        "",
        e.name,
        `  ${when}`,
        `  ${where}`,
        ...(map ? [`  Map: ${map}`] : []),
        ...(dress ? [`  Dress code: ${dress}`] : []),
      ];
    }),
    "",
    `${call}: ${input.inviteUrl}`,
    ...(by ? [by] : []),
    "This link is only for you. Please do not share it.",
    "",
    ...(input.websiteUrl ? [`Wedding website: ${input.websiteUrl}`, ""] : []),
    "With love,",
    couple,
  ].join("\n");

  const items = input.events
    .map((e) => {
      const { when, where, map, dress } = eventLines(e);
      return `<li style="margin-bottom:12px"><strong>${escapeHtml(e.name)}</strong><br>${escapeHtml(when)}<br>${escapeHtml(where)}${
        map ? `<br><a href="${escapeHtml(map)}">View on map</a>` : ""
      }${dress ? `<br>Dress code: ${escapeHtml(dress)}` : ""}</li>`;
    })
    .join("\n");

  const html = `<p>Dear ${escapeHtml(input.guestName)},</p>
<p>${escapeHtml(intro)}</p>
<p>${input.events.length === 1 ? "You are invited to:" : "You are invited to these events:"}</p>
<ul style="padding-left:18px">
${items}
</ul>
<p><a href="${escapeHtml(input.inviteUrl)}">${call}</a></p>${
    by
      ? `
<p>${escapeHtml(by)}</p>`
      : ""
  }
<p>This link is only for you. Please do not share it.</p>
${
  input.websiteUrl
    ? `<p>Wedding website: <a href="${escapeHtml(input.websiteUrl)}">${escapeHtml(input.websiteUrl)}</a></p>
`
    : ""
}<p>With love,<br>${escapeHtml(couple)}</p>`;

  return { subject, html, text };
}
