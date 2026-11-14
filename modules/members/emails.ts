import "server-only";
import {
  button,
  linkFallback,
  paragraph,
  paragraphHtml,
  renderLayout,
  renderText,
  strong,
  weddingFooter,
} from "@/lib/email-layout";
import { coreEnv } from "@/lib/env";
import type { Mail } from "@/lib/mailer";
import { firstName } from "@/lib/names";
import { oneLine } from "@/lib/html";

// The member invite email, in the shared layout (lib/email-layout.ts).

type Role = "admin" | "manager";

export type MemberInviteContent = {
  name: string;
  invitedBy: string;
  weddingName: string;
  role: Role;
  link: string;
};

/** The content of the email for a given link. Pure, so tests and the preview call it directly. */
export function renderMemberInvite({
  name,
  invitedBy,
  weddingName,
  role,
  link,
}: MemberInviteContent) {
  const first = firstName(name);
  const roleText = role === "admin" ? "an Admin" : "a Manager";
  const subject = oneLine(`${invitedBy} invited you to plan ${weddingName} on Make My Marriage`);
  const expiry = "The link works once and expires in 7 days.";
  const ignore = "If you weren't expecting this, you can ignore this email.";
  const footer = weddingFooter(weddingName);
  const html = renderLayout({
    title: subject,
    preheader: `${invitedBy} invited you to help plan ${weddingName}. The link expires in 7 days.`,
    bodyHtml: [
      paragraph(`Hi ${first},`),
      paragraphHtml(
        `${strong(invitedBy)} has invited you to help plan the wedding of ${strong(weddingName)} as ${roleText}.`,
      ),
      button("Accept invitation", link),
      linkFallback(link),
      paragraph(`${expiry} ${ignore}`, { secondary: true, small: true }),
    ].join("\n"),
    footer,
  });
  const text = renderText(
    [
      `Hi ${first},`,
      "",
      `${invitedBy} has invited you to help plan the wedding of ${weddingName} as ${roleText}.`,
      "",
      "Accept invitation:",
      link,
      "",
      `${expiry} ${ignore}`,
    ],
    footer,
  );
  return { subject, html, text };
}

type InviteMail = Omit<MemberInviteContent, "link"> & { to: string; token: string };

export function memberInviteMail({ to, token, ...content }: InviteMail): Mail {
  const link = `${coreEnv().APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  return { to, ...renderMemberInvite({ ...content, link }) };
}
