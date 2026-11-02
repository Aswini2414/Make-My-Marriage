import "server-only";
import { coreEnv } from "@/lib/env";
import type { Mail } from "@/lib/mailer";

// Plain, simple templates keep emails out of spam folders.

type InviteMail = {
  to: string;
  name: string;
  invitedBy: string;
  weddingName: string;
  role: "admin" | "manager";
  token: string;
};

export function memberInviteMail({
  to,
  name,
  invitedBy,
  weddingName,
  role,
  token,
}: InviteMail): Mail {
  const link = `${coreEnv().APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  const roleText = role === "admin" ? "an Admin" : "a Manager";
  const subject = `${invitedBy} invited you to plan ${weddingName} on Make My Marriage`;
  const text = [
    `Hi ${name},`,
    "",
    `${invitedBy} has invited you to help plan the wedding of ${weddingName} as ${roleText}.`,
    "",
    "Open this link to join. It works once and expires in 7 days:",
    link,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(invitedBy)} has invited you to help plan the wedding of <strong>${escapeHtml(weddingName)}</strong> as ${roleText}.</p>
<p><a href="${link}">Join the wedding</a></p>
<p>The link works once and expires in 7 days. If you weren't expecting this, you can ignore this email.</p>`;
  return { to, subject, html, text };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
