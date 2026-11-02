import "server-only";
import { coreEnv } from "@/lib/env";
import type { Mail } from "@/lib/mailer";

// Plain, simple templates keep emails out of spam folders.

export function passwordResetMail(to: string, name: string, token: string): Mail {
  const link = `${coreEnv().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Make My Marriage password";
  const text = [
    `Hi ${name},`,
    "",
    "Use this link to choose a new password. It works once and expires in 1 hour:",
    link,
    "",
    "If you didn't ask for this, you can ignore this email.",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>Use this link to choose a new password. It works once and expires in 1 hour:</p>
<p><a href="${link}">Reset your password</a></p>
<p>If you didn't ask for this, you can ignore this email.</p>`;
  return { to, subject, html, text };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
