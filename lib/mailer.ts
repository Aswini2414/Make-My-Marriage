import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { emailConfig, resetEmailConfig } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { createPacer, type Pacer } from "@/lib/pacer";
import { DAY, reserve } from "@/lib/rate-limit";

// Every email the app sends goes through sendMail(): invitations, reminders, test emails, password
// resets and member invites. The provider is whatever SMTP service the environment names (Resend
// in production; the old Gmail settings still work as a fallback), see lib/env.ts.
//
// One cap is shared by every wedding and every kind of email (EMAIL_DAILY_CAP). It must stay below
// the provider's own daily limit. The count lives in the rateLimits collection under "email:daily".
//
// Logging: never write an address, a link or the API key. Errors leave this file as MailError,
// which carries only a kind and a short code, because the provider's own reply can quote the
// address.

export const DAILY_KEY = "email:daily";

let transport: Transporter | undefined;
let pacer: Pacer | undefined;

function mailer() {
  if (transport) return transport;
  const options = emailConfig().transport;
  transport = nodemailer.createTransport({
    ...options,
    // On a port that starts plain (587, 2525) the connection must upgrade to TLS, or the send
    // fails: the key is never sent over an unencrypted connection, even if STARTTLS is stripped.
    ...("host" in options && !options.secure ? { requireTLS: true } : {}),
    // A stuck connection must give up in well under the minute a send batch holds its claim
    // (modules/invitations/service.ts), or a second batch could start on the same guest.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Forgets the transport, the pacing and the cached settings. For tests that change the environment. */
export function resetMailer(): void {
  transport = undefined;
  pacer = undefined;
  resetEmailConfig();
}

export type Mail = { to: string; subject: string; html: string; text: string };

// ---- what went wrong ----

/**
 * - `temporary`: the provider did not accept the email and said "not now" (a rate limit, a busy
 *   server, a connection that never opened). Nothing was delivered, so trying again later cannot
 *   send it twice.
 * - `setup`: the provider refused us, not the guest: the login was refused, or the domain is not
 *   verified, or the account may only send test emails. Nothing was delivered, and waiting does
 *   not help until the settings are fixed. It must never mark guests failed.
 * - `quota`: the provider's own daily or monthly allowance is used up. `sendMail` turns this into
 *   EMAIL_CAP_REACHED, so a send pauses like it does at our own cap.
 * - `rejected`: the provider refused this email for good (a bad or refused address).
 * - `failed`: anything else, including a timeout while the email was on its way. It may or may not
 *   have been delivered, so it is never retried on its own.
 */
export type MailErrorKind = "temporary" | "setup" | "quota" | "rejected" | "failed";

export class MailError extends Error {
  readonly kind: MailErrorKind;
  /** A short code such as "450" or "ETIMEDOUT". Never text from the provider. */
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(kind: MailErrorKind, code: string, retryAfterSeconds?: number) {
    super(`Email not sent (${kind}, ${code})`);
    this.name = "MailError";
    this.kind = kind;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type TransportError = {
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
  response?: unknown;
  message?: unknown;
};

const SMTP_TEMPORARY = new Set([421, 450, 451, 452, 454]);
// Login refused: our key or password is wrong or revoked. That is not the guest's fault, so it must
// never mark guests failed; the send waits until the settings are fixed.
const SMTP_AUTH = new Set([530, 534, 535]);
// How long a send waits after a "setup" refusal before it tries again (the settings must be fixed).
const SETUP_RETRY_SECONDS = 300;
// The provider's own daily or monthly allowance. "mailbox quota exceeded" is about one recipient
// and has neither word, so it stays a rejection.
const QUOTA_WORDS =
  /\b(daily|monthly)\b[^.]{0,40}\b(quota|limit)\b|\b(quota|limit)\b[^.]{0,40}\b(daily|monthly)\b/i;
// Our account or sender is refused, not the guest: an unverified domain, a key that may not send,
// an account that may only send test emails.
const SETUP_WORDS =
  /domain[^.]{0,60}not (yet )?verified|verify (your|a|the) domain|testing emails|api key|not (authori[sz]ed|allowed) to send|from address|sender[^.]{0,40}(not|isn't) (verified|allowed)/i;
const ADDRESS = /[^\s<>"']+@[^\s<>"']+/g;
const RATE_LIMIT_WORDS = /\b429\b|rate[\s_-]?limit|too many|throttl|quota/i;

/** Sorts a transport error into a MailError. Reads the error, copies none of its text. */
export function toMailError(err: unknown): MailError {
  const e = (err ?? {}) as TransportError;
  const responseCode = typeof e.responseCode === "number" ? e.responseCode : undefined;
  const raw = typeof e.code === "string" ? e.code : undefined;
  const code =
    raw && /^[A-Z0-9_]{1,32}$/.test(raw) ? raw : responseCode ? String(responseCode) : "ERROR";
  // The provider's reply often quotes the recipient. Addresses are taken out before any word is
  // looked for, so a guest called daily-limit@example.com or too-many@example.com cannot look
  // like a quota or a rate limit.
  const text = `${typeof e.response === "string" ? e.response : ""} ${
    typeof e.message === "string" ? e.message : ""
  }`.replace(ADDRESS, " ");

  // Only here do underscores count as spaces, so "daily_quota_exceeded" reads like the sentence
  // it stands for. Elsewhere they stay: a key such as "re_x_api_key_1" must not look like words.
  if (QUOTA_WORDS.test(text.replace(/_/g, " "))) return new MailError("quota", code);
  if (
    raw === "EAUTH" ||
    (responseCode !== undefined && SMTP_AUTH.has(responseCode)) ||
    SETUP_WORDS.test(text)
  ) {
    return new MailError("setup", code, SETUP_RETRY_SECONDS);
  }

  // The provider's own words for "slow down". A permanent 5xx is the exception: "552 mailbox quota
  // exceeded" is about one recipient and will not clear by waiting.
  if (RATE_LIMIT_WORDS.test(text) && !(responseCode !== undefined && responseCode >= 500)) {
    const hint = /retry[\s-]?after[:\s]+(\d{1,5})/i.exec(text);
    return new MailError("temporary", code, hint ? Number(hint[1]) : undefined);
  }
  // "Not now" said about this one recipient (4xx at RCPT TO, with no word about a rate limit):
  // waiting would hold the whole send on this guest, so it counts as this guest's failure. The
  // Admin can retry the failed ones later.
  if (
    e.command === "RCPT TO" &&
    responseCode !== undefined &&
    responseCode >= 400 &&
    responseCode < 500
  ) {
    return new MailError("rejected", code);
  }
  if (responseCode !== undefined && SMTP_TEMPORARY.has(responseCode)) {
    return new MailError("temporary", code);
  }
  // The connection never opened (or the greeting never came): nothing was sent.
  if (e.command === "CONN") return new MailError("temporary", code);
  if (raw === "EENVELOPE" || (responseCode !== undefined && responseCode >= 500)) {
    return new MailError("rejected", code);
  }
  return new MailError("failed", code);
}

// ---- sending ----

/**
 * Sends one email. Waits its turn so sends never start faster than EMAIL_SENDS_PER_SECOND, refuses
 * with 429 EMAIL_CAP_REACHED once the daily cap is used up, and counts every email that goes out.
 * Any other failure is thrown as a MailError.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const config = emailConfig();
  // The turn comes before the daily place, so a place is never held while waiting.
  await (pacer ??= createPacer(config.sendsPerSecond)).wait();
  const release = await reserve(DAILY_KEY, config.dailyCap, DAY, "EMAIL_CAP_REACHED");
  try {
    await mailer().sendMail({
      from: config.from,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      ...mail,
      // A development safety net: everything goes to one address, the real recipient is dropped.
      ...(config.devRedirect
        ? { to: config.devRedirect, subject: `[redirected] ${mail.subject}` }
        : {}),
    });
  } catch (err) {
    const failure = toMailError(err);
    // The place is given back when the provider did not take the email. When the outcome is
    // unknown (a timeout while it was on its way) it may have gone out, so the place stays used:
    // the count must not fall behind what the provider has really sent.
    if (failure.kind !== "failed") await release().catch(() => {});
    if (failure.kind === "quota") {
      console.error("[email] the provider's own sending allowance is used up", failure.code);
      throw new ApiError("EMAIL_CAP_REACHED");
    }
    if (failure.kind === "setup") {
      console.error(
        "[email] the provider refused our settings (login, domain or account)",
        failure.code,
      );
    }
    throw failure;
  }
}

/**
 * What a caller outside a batch send answers when `sendMail` threw a MailError (a member invite, a
 * test email): a refused address is a problem with that address; anything else is "not right now".
 * Nothing from the provider reaches the person.
 */
export function apiErrorFor(err: MailError): ApiError {
  if (err.kind === "rejected") {
    const message = "We couldn't send an email to that address. Check it and try again.";
    return new ApiError("VALIDATION_FAILED", message, { fields: { email: message } });
  }
  return new ApiError("EMAIL_UNAVAILABLE", undefined, {
    retryAfterSeconds: err.retryAfterSeconds ?? 60,
  });
}
