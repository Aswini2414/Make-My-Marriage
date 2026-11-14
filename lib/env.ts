import "server-only";
import { z } from "zod";

// Environment variables are validated per area, so a missing R2 or email setting only
// fails the feature that needs it, with a clear message, instead of every request.
// A message names the variable and what is wrong with it. It never contains a value: values
// can be secrets (SMTP_PASSWORD is an API key).

const coreSchema = z.object({
  MONGODB_URI: z.string().startsWith("mongodb"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64-encoded"),
  APP_URL: z.url(),
});

const r2Schema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
});

// ---- email ----
// Any SMTP provider (Resend in production). The old Gmail pair still works as a fallback.

const smtpSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  EMAIL_FROM_ADDRESS: z.email(),
});

const gmailSchema = z.object({
  GMAIL_USER: z.email(),
  GMAIL_APP_PASSWORD: z.string().min(1),
});

const emailOptionsSchema = z.object({
  EMAIL_FROM_NAME: z.string().trim().min(1).max(80).default("Make My Marriage"),
  EMAIL_REPLY_TO: z.email().optional(),
  EMAIL_DEV_REDIRECT: z.email().optional(),
  EMAIL_DAILY_CAP: z.coerce.number().int().positive().optional(),
  // At least 0.5 a second, so a batch of 20 (40 s) always finishes inside its 60 s claim.
  EMAIL_SENDS_PER_SECOND: z.coerce.number().min(0.5).max(1000).default(2),
});

/** Everything the mailer needs, from whichever provider is configured. */
export type EmailConfig = {
  provider: "smtp" | "gmail";
  /** The nodemailer transport options (host and port, or the Gmail service, plus the login). */
  transport:
    | { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }
    | { service: "gmail"; auth: { user: string; pass: string } };
  from: { name: string; address: string };
  replyTo?: string;
  /** When set, every email goes to this address instead of its real recipient. */
  devRedirect?: string;
  /** Emails per 24 hours, across every email the app sends. */
  dailyCap: number;
  sendsPerSecond: number;
};

/** The environment with empty values removed, so `EMAIL_REPLY_TO=` in a copied .env counts as unset. */
function nonEmptyEnv(): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
}

function parse<T extends z.ZodType>(
  schema: T,
  area: string,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const vars = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid ${area} environment variables. ${vars}. See .env.example.`);
  }
  return result.data;
}

let core: z.infer<typeof coreSchema> | undefined;
let r2: z.infer<typeof r2Schema> | undefined;
let email: EmailConfig | undefined;
let warned = false;

export const coreEnv = () => (core ??= parse(coreSchema, "core"));
/** APP_URL alone, for pages that need the address but nothing secret, such as metadata. */
export const appUrl = () => parse(coreSchema.pick({ APP_URL: true }), "core").APP_URL;
/** MONGODB_URI alone, so `npm run db:indexes` can run against any database with just this set. */
export const mongoUri = () => parse(coreSchema.pick({ MONGODB_URI: true }), "database").MONGODB_URI;
export const r2Env = () => (r2 ??= parse(r2Schema, "R2"));

const NOT_CONFIGURED =
  "Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM_ADDRESS " +
  "(or, deprecated, GMAIL_USER and GMAIL_APP_PASSWORD). See .env.example.";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/**
 * Every email links to APP_URL (invitations, resets, invites), so in production it must be a
 * public https address. An http or localhost value would put dead or unsafe links in every email.
 */
function assertPublicAppUrl() {
  if (process.env.NODE_ENV !== "production") return;
  const url = new URL(appUrl());
  if (
    url.protocol !== "https:" ||
    LOCAL_HOSTS.has(url.hostname) ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new Error(
      "APP_URL must be a public https address in production: every email links to it. Fix APP_URL in the environment.",
    );
  }
}

/**
 * The email settings, checked the first time an email is sent. The generic SMTP settings win
 * when SMTP_HOST is set; otherwise the Gmail pair is used (deprecated, kept so production does not
 * break). A problem names the variable, never its value.
 */
export function emailConfig(): EmailConfig {
  if (email) return email;
  assertPublicAppUrl();
  const env = nonEmptyEnv();
  const options = parse(emailOptionsSchema, "email", env);

  let config: EmailConfig;
  if (env.SMTP_HOST) {
    const smtp = parse(smtpSchema, "email", env);
    config = {
      provider: "smtp",
      transport: {
        host: smtp.SMTP_HOST,
        port: smtp.SMTP_PORT,
        // 465 is implicit TLS; other ports (587, 2525) start plain and upgrade with STARTTLS.
        secure: smtp.SMTP_PORT === 465,
        auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASSWORD },
      },
      from: { name: options.EMAIL_FROM_NAME, address: smtp.EMAIL_FROM_ADDRESS },
      dailyCap: options.EMAIL_DAILY_CAP ?? 90,
      sendsPerSecond: options.EMAIL_SENDS_PER_SECOND,
    };
  } else if (env.GMAIL_USER || env.GMAIL_APP_PASSWORD) {
    const gmail = parse(gmailSchema, "email", env);
    if (!warned && process.env.NODE_ENV !== "test") {
      warned = true;
      console.warn(
        "[email] GMAIL_USER and GMAIL_APP_PASSWORD are deprecated. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM_ADDRESS instead.",
      );
    }
    config = {
      provider: "gmail",
      transport: {
        service: "gmail",
        auth: { user: gmail.GMAIL_USER, pass: gmail.GMAIL_APP_PASSWORD },
      },
      from: { name: options.EMAIL_FROM_NAME, address: gmail.GMAIL_USER },
      dailyCap: options.EMAIL_DAILY_CAP ?? 450,
      sendsPerSecond: options.EMAIL_SENDS_PER_SECOND,
    };
  } else {
    throw new Error(NOT_CONFIGURED);
  }

  if (options.EMAIL_REPLY_TO) config.replyTo = options.EMAIL_REPLY_TO;
  if (options.EMAIL_DEV_REDIRECT) {
    // A development and test aid only. In production it is ignored, so a variable left behind
    // there can never send guests' invitations to one inbox.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[email] EMAIL_DEV_REDIRECT is ignored in production. Remove it from the environment.",
      );
    } else {
      config.devRedirect = options.EMAIL_DEV_REDIRECT;
      if (process.env.NODE_ENV !== "test") {
        console.warn("[email] EMAIL_DEV_REDIRECT is set: every email goes to that one address.");
      }
    }
  }
  return (email = config);
}

/** The daily email cap alone (for the quota), with the same checks as sending. */
export const emailDailyCap = () => emailConfig().dailyCap;

/** Forgets the cached settings. For tests that change the environment. */
export function resetEmailConfig(): void {
  email = undefined;
  warned = false;
}
