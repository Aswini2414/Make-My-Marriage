import { formatDate, formatDateWithDay, formatTime12 } from "@/lib/dates";
import {
  button,
  card,
  COLORS,
  eyebrow,
  heading,
  linkFallback,
  paragraph,
  paragraphHtml,
  renderLayout,
  renderText,
  strong,
  weddingFooter,
} from "@/lib/email-layout";
import { escapeHtml, oneLine, safeHref } from "@/lib/html";
import type { Mail } from "@/lib/mailer";
import { firstName } from "@/lib/names";
import type { SendKind } from "./model";

// The guest invitation and the reminder: English only, one template for every guest, in the shared
// layout (lib/email-layout.ts). Every value a member typed (names, venue, address, dress code) is
// escaped, and a map link is used only when it is a real https:// address. Pure functions: no
// database, no environment, so the tests and the preview can call them directly. No tracking
// pixel: "opened" is the guest opening their own link (docs/api-design.md).

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
  /** YYYY-MM-DD */
  weddingDate: string;
  guestName: string;
  /** The RSVP cut-off day (YYYY-MM-DD), when the couple set one. */
  replyBy?: string;
  /**
   * The events to list, in date order: the ones this guest is invited to, or for a reminder only
   * the ones they have not answered yet.
   */
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

/** One event as a card: name, when, where, dress code, and a map link if there is one. */
function eventCard(event: EmailEvent): string {
  const { when, where, map, dress } = eventLines(event);
  const e = escapeHtml;
  return card(
    [
      `<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:26px;color:${COLORS.ink};">${e(event.name)}</div>`,
      `<div style="margin-top:2px;font-weight:600;color:${COLORS.ink};">${e(when)}</div>`,
      `<div style="margin-top:6px;">${e(where)}</div>`,
      ...(dress
        ? [`<div style="margin-top:6px;color:${COLORS.secondary};">Dress code: ${e(dress)}</div>`]
        : []),
      ...(map
        ? [
            `<div style="margin-top:8px;"><a href="${e(map)}" target="_blank" style="color:${COLORS.plum};font-weight:600;text-decoration:underline;">Open in Maps</a></div>`,
          ]
        : []),
    ].join(""),
  );
}

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const couple = `${input.brideName} & ${input.groomName}`;
  const reminder = input.kind === "reminder";
  const subject = oneLine(
    reminder
      ? `Reminder: please reply to ${couple}'s invitation`
      : `You are invited to ${couple}'s wedding`,
  );
  const first = firstName(input.guestName);
  const weddingDate = formatDate(input.weddingDate);
  const intro = reminder
    ? `This is a friendly reminder. ${couple} would love to know if you can join them. Please tell them which events you will come to.`
    : `${couple} are getting married and would love to have you with them.`;
  const listTitle = reminder
    ? input.events.length === 1
      ? "They are still waiting to hear about:"
      : "They are still waiting to hear about these events:"
    : input.events.length === 1
      ? "You are invited to:"
      : "You are invited to these events:";
  const by = input.replyBy ? `Please reply by ${formatDate(input.replyBy)}.` : "";
  const call = "View invitation and reply";
  const privateNote = "This link is only for you. Please do not share it.";
  const footer = weddingFooter(couple);

  const text = renderText(
    [
      reminder ? "A gentle reminder" : "YOU ARE INVITED",
      couple,
      weddingDate,
      "",
      `Dear ${first},`,
      "",
      intro,
      "",
      listTitle,
      ...input.events.flatMap((e) => {
        const { when, where, map, dress } = eventLines(e);
        return [
          "",
          e.name,
          `  ${when}`,
          `  ${where}`,
          ...(dress ? [`  Dress code: ${dress}`] : []),
          ...(map ? [`  Open in Maps: ${map}`] : []),
        ];
      }),
      "",
      ...(by ? [by] : []),
      `${call}:`,
      input.inviteUrl,
      "",
      privateNote,
      ...(input.websiteUrl ? ["", `Wedding website: ${input.websiteUrl}`] : []),
      "",
      "With love,",
      couple,
    ],
    footer,
  );

  const html = renderLayout({
    title: subject,
    preheader: reminder
      ? `${couple} would love to know if you can join them.${input.replyBy ? ` Please reply by ${formatDate(input.replyBy)}.` : ""}`
      : `${weddingDate}.${input.replyBy ? ` Please reply by ${formatDate(input.replyBy)}.` : " Open your invitation to see the events and reply."}`,
    bodyHtml: [
      reminder
        ? `${heading("A gentle reminder", 30)}<p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:26px;color:${COLORS.ink};">${escapeHtml(couple)}<span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.secondary};"> &nbsp;·&nbsp; ${escapeHtml(weddingDate)}</span></p>`
        : `${eyebrow("You are invited")}${heading(couple, 34)}<p style="margin:0 0 24px;font-size:14px;line-height:20px;color:${COLORS.secondary};">${escapeHtml(weddingDate)}</p>`,
      paragraphHtml(`Dear ${strong(first)},`),
      paragraph(intro),
      paragraph(listTitle),
      ...input.events.map(eventCard),
      ...(by ? [paragraphHtml(strong(by))] : []),
      button(call, input.inviteUrl),
      linkFallback(input.inviteUrl),
      paragraph(privateNote, { secondary: true, small: true }),
      ...(input.websiteUrl
        ? [
            paragraphHtml(
              `Wedding website: <a href="${escapeHtml(input.websiteUrl)}" target="_blank" style="color:${COLORS.plum};text-decoration:underline;">${escapeHtml(input.websiteUrl)}</a>`,
              { small: true },
            ),
          ]
        : []),
      paragraphHtml(`With love,<br>${escapeHtml(couple)}`),
    ].join("\n"),
    footer,
  });

  return { subject, html, text };
}
