import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { mailEnv } from "@/lib/env";

// Gmail SMTP through a dedicated account with an App Password.
// Known v1 limitation: one Gmail account is shared by every wedding, with a daily cap of
// EMAIL_DAILY_CAP (450). The cap is counted in the rateLimits collection under "gmail:daily".

let transport: Transporter | undefined;

function mailer() {
  if (transport) return transport;
  const env = mailEnv();
  transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });
  return transport;
}

export type Mail = { to: string; subject: string; html: string; text: string };

/**
 * Sends one email. Callers must check and record the daily cap first; that check is
 * added with lib/rate-limit.ts in Phase 1.
 */
export async function sendMail(mail: Mail): Promise<void> {
  await mailer().sendMail({
    from: { name: "Make My Marriage", address: mailEnv().GMAIL_USER },
    ...mail,
  });
}
