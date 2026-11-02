import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { mailEnv } from "@/lib/env";
import { DAY, reserve } from "@/lib/rate-limit";

// Gmail SMTP through a dedicated account with an App Password.
// Known v1 limitation: one Gmail account is shared by every wedding, with a daily cap of
// EMAIL_DAILY_CAP (450). The cap is counted in the rateLimits collection under "gmail:daily".

const DAILY_KEY = "gmail:daily";

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
 * Sends one email. Refuses with 429 EMAIL_CAP_REACHED once the daily cap is used up,
 * and counts every email that goes out.
 */
export async function sendMail(mail: Mail): Promise<void> {
  // The place is taken before sending and given back if the send fails.
  const release = await reserve(DAILY_KEY, mailEnv().EMAIL_DAILY_CAP, DAY, "EMAIL_CAP_REACHED");
  try {
    await mailer().sendMail({
      from: { name: "Make My Marriage", address: mailEnv().GMAIL_USER },
      ...mail,
    });
  } catch (err) {
    await release();
    throw err;
  }
}
