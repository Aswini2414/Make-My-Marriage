import "server-only";
import {
  ACCOUNT_FOOTER,
  button,
  linkFallback,
  paragraph,
  renderLayout,
  renderText,
} from "@/lib/email-layout";
import { coreEnv } from "@/lib/env";
import type { Mail } from "@/lib/mailer";
import { firstName } from "@/lib/names";

// The password reset email, in the shared layout (lib/email-layout.ts).

export const PASSWORD_RESET_SUBJECT = "Reset your Make My Marriage password";

/** The content of the email for a given link. Pure, so tests and the preview call it directly. */
export function renderPasswordReset({ name, link }: { name: string; link: string }) {
  const first = firstName(name);
  const intro = "Use this link to choose a new password. It works once and expires in 1 hour.";
  const ignore = "If you didn't ask for this, you can ignore this email.";
  const html = renderLayout({
    title: PASSWORD_RESET_SUBJECT,
    preheader: "Choose a new password. The link works once and expires in 1 hour.",
    bodyHtml: [
      paragraph(`Hi ${first},`),
      paragraph(intro),
      button("Reset your password", link),
      linkFallback(link),
      paragraph(ignore, { secondary: true, small: true }),
    ].join("\n"),
    footer: ACCOUNT_FOOTER,
  });
  const text = renderText(
    [`Hi ${first},`, "", intro, "", "Reset your password:", link, "", ignore],
    ACCOUNT_FOOTER,
  );
  return { subject: PASSWORD_RESET_SUBJECT, html, text };
}

export function passwordResetMail(to: string, name: string, token: string): Mail {
  const link = `${coreEnv().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return { to, ...renderPasswordReset({ name, link }) };
}
