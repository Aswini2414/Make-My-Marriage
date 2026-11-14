import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Only the SMTP transport is replaced. The settings, the pacing, the daily cap and the database run
// for real, and no email leaves the machine.
const sendMailSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const createTransportSpy = vi.hoisted(() =>
  vi.fn((options: unknown) => ({ sendMail: sendMailSpy, options })),
);
vi.mock("nodemailer", () => ({ default: { createTransport: createTransportSpy } }));

import { emailConfig } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { apiErrorFor, MailError, resetMailer, sendMail, toMailError } from "@/lib/mailer";
import { createPacer } from "@/lib/pacer";
import { RateLimit } from "@/lib/rate-limit";
import { emptyDb, resetDb } from "../helpers";

beforeAll(resetDb);
afterAll(() => mongoose.disconnect());

const EMAIL_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_FROM_NAME",
  "EMAIL_REPLY_TO",
  "EMAIL_DEV_REDIRECT",
  "EMAIL_DAILY_CAP",
  "EMAIL_SENDS_PER_SECOND",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
];
const saved = Object.fromEntries(EMAIL_VARS.map((k) => [k, process.env[k]]));

/** Replaces the email settings for one test (anything not listed is unset). */
function setEmailEnv(values: Record<string, string> = {}) {
  for (const k of EMAIL_VARS) delete process.env[k];
  // Pacing off unless a test turns it on.
  process.env.EMAIL_SENDS_PER_SECOND = "1000";
  Object.assign(process.env, values);
  resetMailer();
}

const RESEND = {
  SMTP_HOST: "smtp.resend.com",
  SMTP_PORT: "465",
  SMTP_USER: "resend",
  SMTP_PASSWORD: "re_SECRET_api_key_123",
  EMAIL_FROM_ADDRESS: "invitations@makemymarriage.cyou",
};
const GMAIL = { GMAIL_USER: "sender@example.com", GMAIL_APP_PASSWORD: "gmail-SECRET-app-password" };

const mail = { to: "guest@example.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

let logs: ReturnType<typeof vi.spyOn>[] = [];
const logged = () => JSON.stringify(logs.flatMap((s) => s.mock.calls));

beforeEach(async () => {
  await emptyDb();
  sendMailSpy.mockReset();
  sendMailSpy.mockResolvedValue({});
  createTransportSpy.mockClear();
  setEmailEnv(GMAIL);
  logs = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(() => {
  logs.forEach((s) => s.mockRestore());
  for (const k of EMAIL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetMailer();
});

describe("which provider is used", () => {
  it("uses the generic SMTP settings: Resend over a secure connection on port 465", async () => {
    setEmailEnv(RESEND);
    await sendMail(mail);
    expect(createTransportSpy).toHaveBeenCalledTimes(1);
    expect(createTransportSpy.mock.calls[0]![0]).toMatchObject({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: RESEND.SMTP_PASSWORD },
    });
    expect(createTransportSpy.mock.calls[0]![0]).not.toHaveProperty("service");
  });

  it("falls back to Gmail when only the Gmail settings exist", async () => {
    setEmailEnv(GMAIL);
    await sendMail(mail);
    expect(createTransportSpy.mock.calls[0]![0]).toMatchObject({
      service: "gmail",
      auth: { user: "sender@example.com", pass: GMAIL.GMAIL_APP_PASSWORD },
    });
    expect(emailConfig().provider).toBe("gmail");
    expect(emailConfig().from.address).toBe("sender@example.com");
  });

  it("lets the generic settings win when both are set", async () => {
    setEmailEnv({ ...GMAIL, ...RESEND });
    expect(emailConfig().provider).toBe("smtp");
    await sendMail(mail);
    expect(createTransportSpy.mock.calls[0]![0]).toMatchObject({ host: "smtp.resend.com" });
    expect(sendMailSpy.mock.calls[0]![0].from.address).toBe("invitations@makemymarriage.cyou");
  });

  it("uses STARTTLS on other ports, and treats empty values as unset", () => {
    setEmailEnv({ ...RESEND, SMTP_PORT: "587", EMAIL_REPLY_TO: "", EMAIL_DEV_REDIRECT: "" });
    const config = emailConfig();
    expect(config.transport).toMatchObject({ port: 587, secure: false });
    expect(config.replyTo).toBeUndefined();
    expect(config.devRedirect).toBeUndefined();
  });

  it("defaults the daily cap to 90 for SMTP and 450 for Gmail, and takes EMAIL_DAILY_CAP", () => {
    setEmailEnv(RESEND);
    expect(emailConfig().dailyCap).toBe(90);
    setEmailEnv(GMAIL);
    expect(emailConfig().dailyCap).toBe(450);
    setEmailEnv({ ...RESEND, EMAIL_DAILY_CAP: "60" });
    expect(emailConfig().dailyCap).toBe(60);
  });

  it("sends at most 2 a second unless told otherwise", () => {
    setEmailEnv(RESEND);
    delete process.env.EMAIL_SENDS_PER_SECOND;
    resetMailer();
    expect(emailConfig().sendsPerSecond).toBe(2);
  });

  it("warns once about the deprecated Gmail settings only outside tests", () => {
    // NODE_ENV is "test" here: the note is for real runs, so the tests stay quiet.
    setEmailEnv(GMAIL);
    emailConfig();
    expect(logged()).toBe("[]");
  });
});

describe("missing or wrong settings", () => {
  it("says what to set when nothing is configured", () => {
    setEmailEnv({});
    expect(() => emailConfig()).toThrow(/Email is not configured.*SMTP_HOST/);
  });

  it("names the missing variable", () => {
    setEmailEnv({ ...RESEND, SMTP_PASSWORD: "" });
    expect(() => emailConfig()).toThrow(/SMTP_PASSWORD/);
    setEmailEnv({ SMTP_HOST: "smtp.resend.com", SMTP_USER: "resend", SMTP_PASSWORD: "x" });
    expect(() => emailConfig()).toThrow(/EMAIL_FROM_ADDRESS/);
    setEmailEnv({ GMAIL_USER: "sender@example.com" });
    expect(() => emailConfig()).toThrow(/GMAIL_APP_PASSWORD/);
  });

  it("never puts a value in the message, secret or not", () => {
    const cases: Record<string, string>[] = [
      { ...RESEND, EMAIL_FROM_ADDRESS: "not-an-address-SECRETVALUE" },
      { ...RESEND, SMTP_PORT: "port-SECRETVALUE" },
      { ...RESEND, EMAIL_REPLY_TO: "nope-SECRETVALUE" },
      { ...RESEND, EMAIL_DEV_REDIRECT: "nope-SECRETVALUE" },
      { ...RESEND, EMAIL_DAILY_CAP: "-SECRETVALUE" },
      { ...RESEND, EMAIL_FROM_ADDRESS: "bad", SMTP_PASSWORD: "re_SECRET_api_key_123" },
      { GMAIL_USER: "not-an-address-SECRETVALUE", GMAIL_APP_PASSWORD: "gmail-SECRET-app-password" },
    ];
    for (const env of cases) {
      setEmailEnv(env);
      let message = "";
      try {
        emailConfig();
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/^Invalid email environment variables\./);
      expect(message).not.toMatch(/SECRET/);
      expect(message).not.toContain("re_");
    }
    expect(logged()).not.toMatch(/SECRET/);
  });

  it("fails the send, with nothing sent and no place used", async () => {
    setEmailEnv({});
    await expect(sendMail(mail)).rejects.toThrow(/not configured/);
    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(0);
  });
});

describe("the message that goes out", () => {
  it("is from the configured name and address, with no Reply-To by default", async () => {
    setEmailEnv({ ...RESEND, EMAIL_FROM_NAME: "Priya & Ravi's invitations" });
    await sendMail(mail);
    const sent = sendMailSpy.mock.calls[0]![0];
    expect(sent.from).toEqual({
      name: "Priya & Ravi's invitations",
      address: "invitations@makemymarriage.cyou",
    });
    expect(sent).not.toHaveProperty("replyTo");
    expect(sent).toMatchObject(mail);
  });

  it("is from 'Make My Marriage' when no name is set", async () => {
    setEmailEnv(RESEND);
    await sendMail(mail);
    expect(sendMailSpy.mock.calls[0]![0].from).toEqual({
      name: "Make My Marriage",
      address: "invitations@makemymarriage.cyou",
    });
  });

  it("carries Reply-To when EMAIL_REPLY_TO is set", async () => {
    setEmailEnv({ ...RESEND, EMAIL_REPLY_TO: "family@example.com" });
    await sendMail(mail);
    expect(sendMailSpy.mock.calls[0]![0].replyTo).toBe("family@example.com");
  });

  it("goes to EMAIL_DEV_REDIRECT instead of the real address, which is written nowhere", async () => {
    setEmailEnv({ ...RESEND, EMAIL_DEV_REDIRECT: "me@example.org" });
    await sendMail(mail);
    const sent = sendMailSpy.mock.calls[0]![0];
    expect(sent.to).toBe("me@example.org");
    expect(sent.subject).toBe("[redirected] Hello");
    expect(JSON.stringify(sent)).not.toContain("guest@example.com");
    expect(logged()).not.toContain("guest@example.com");
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(1);
  });
});

describe("EMAIL_DEV_REDIRECT is for development only", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is ignored in production: the guest still gets the email, and a warning is logged", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://makemymarriage.cyou");
    setEmailEnv({ ...RESEND, EMAIL_DEV_REDIRECT: "me@example.org" });
    expect(emailConfig().devRedirect).toBeUndefined();
    await sendMail(mail);
    const sent = sendMailSpy.mock.calls[0]![0];
    expect(sent.to).toBe("guest@example.com");
    expect(sent.subject).toBe("Hello");
    expect(logged()).toContain("EMAIL_DEV_REDIRECT is ignored in production");
    expect(logged()).not.toContain("me@example.org");
  });

  it("still redirects in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setEmailEnv({ ...RESEND, EMAIL_DEV_REDIRECT: "me@example.org" });
    await sendMail(mail);
    expect(sendMailSpy.mock.calls[0]![0].to).toBe("me@example.org");
  });
});

describe("APP_URL in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("must be a public https address, because every email links to it", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const bad of [
      "http://makemymarriage.cyou",
      "https://localhost:3000",
      "https://127.0.0.1",
      "https://app.localhost",
    ]) {
      vi.stubEnv("APP_URL", bad);
      setEmailEnv(RESEND);
      expect(() => emailConfig(), bad).toThrow(/APP_URL must be a public https address/);
    }
    vi.stubEnv("APP_URL", "https://makemymarriage.cyou");
    setEmailEnv(RESEND);
    expect(emailConfig().provider).toBe("smtp");
  });

  it("may be http://localhost while developing and testing", () => {
    for (const env of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      vi.stubEnv("APP_URL", "http://localhost:3000");
      setEmailEnv(RESEND);
      expect(() => emailConfig()).not.toThrow();
    }
  });

  it("stops the email before anything is sent or counted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    setEmailEnv(RESEND);
    await expect(sendMail(mail)).rejects.toThrow(/APP_URL must be a public https/);
    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(0);
  });
});

describe("the connection", () => {
  it("must upgrade to TLS on a port that starts plain, and is secure from the start on 465", async () => {
    setEmailEnv({ ...RESEND, SMTP_PORT: "587" });
    await sendMail(mail);
    expect(createTransportSpy.mock.calls[0]![0]).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
    });
    resetMailer();
    createTransportSpy.mockClear();
    setEmailEnv(RESEND);
    await sendMail(mail);
    expect(createTransportSpy.mock.calls[0]![0]).toMatchObject({ port: 465, secure: true });
    expect(createTransportSpy.mock.calls[0]![0]).not.toHaveProperty("requireTLS");
  });
});

describe("pacing", () => {
  it("never starts more than 2 sends in any second (fake clock)", async () => {
    let clock = 10_000;
    let slept: number | undefined;
    const pacer = createPacer(
      2,
      () => clock,
      (ms) => {
        slept = ms;
        return Promise.resolve();
      },
    );
    const starts: number[] = [];
    /** Asks for a turn and notes when it would start: now, plus any wait it was told to sleep. */
    const ask = () => {
      slept = undefined;
      void pacer.wait();
      starts.push(clock + (slept ?? 0));
    };
    for (let i = 0; i < 10; i++) ask(); // ten sends that all ask at the same moment
    clock += 700;
    for (let i = 0; i < 3; i++) ask(); // and three more a little later
    clock += 20_000;
    ask(); // after a quiet spell there is no wait at all
    expect(slept).toBeUndefined();

    starts.sort((a, b) => a - b);
    expect(starts).toHaveLength(14);
    for (const t of starts) {
      // Starts inside any window of one second (from t, not including t + 1000).
      expect(starts.filter((s) => s >= t && s < t + 1000).length).toBeLessThanOrEqual(2);
    }
    // Steady half-second spacing for the burst.
    expect(starts.slice(0, 4)).toEqual([10_000, 10_500, 11_000, 11_500]);
  });

  it("makes sendMail wait its turn, so a burst is spread out", async () => {
    setEmailEnv({ ...RESEND, EMAIL_SENDS_PER_SECOND: "20" }); // one every 50 ms
    const times: number[] = [];
    sendMailSpy.mockImplementation(async () => {
      times.push(Date.now());
      return {};
    });
    await Promise.all(Array.from({ length: 5 }, () => sendMail(mail)));
    expect(times).toHaveLength(5);
    times.sort((a, b) => a - b);
    // 4 gaps of 50 ms: allow some slack for the timers, but they must not all fire together.
    expect(times[4]! - times[0]!).toBeGreaterThanOrEqual(160);
  });
});

describe("what a failure means", () => {
  const smtp = (responseCode: number, response: string, extra = {}) =>
    Object.assign(new Error(response), { responseCode, response, ...extra });

  it("treats a rate limit or a busy server as temporary", () => {
    for (const err of [
      smtp(450, "450 4.2.1 Mailbox busy"),
      smtp(421, "421 Service not available"),
      smtp(451, "451 Try again"),
      smtp(452, "452 Too many recipients"),
      smtp(454, "454 Throttled"),
      smtp(429, "429 Too Many Requests"),
      new Error("Rate limit exceeded: 2 requests per second"),
      Object.assign(new Error("connect failed"), { code: "ECONNECTION", command: "CONN" }),
      Object.assign(new Error("greeting timeout"), { code: "ETIMEDOUT", command: "CONN" }),
    ]) {
      expect(toMailError(err).kind, String((err as Error).message)).toBe("temporary");
    }
  });

  it("reads a retry hint when the provider gives one", () => {
    expect(
      toMailError(new Error("429 rate limited, retry after 30 seconds")).retryAfterSeconds,
    ).toBe(30);
    expect(toMailError(smtp(450, "450 try later")).retryAfterSeconds).toBeUndefined();
  });

  it("treats a refused recipient as rejected, even when it mentions a quota", () => {
    for (const err of [
      smtp(550, "550 5.1.1 User unknown"),
      smtp(553, "553 Invalid address"),
      smtp(554, "554 Rejected"),
      smtp(552, "552 Mailbox quota exceeded"),
      Object.assign(new Error("No recipients"), { code: "EENVELOPE" }),
    ]) {
      expect(toMailError(err).kind, String((err as Error).message)).toBe("rejected");
    }
  });

  it("treats anything else, such as a timeout mid-send, as failed and never to be retried", () => {
    for (const err of [
      new Error("boom"),
      Object.assign(new Error("timeout"), { code: "ETIMEDOUT", command: "DATA" }),
      Object.assign(new Error("reset"), { code: "ECONNRESET" }),
      "a string",
      undefined,
    ]) {
      expect(toMailError(err).kind).toBe("failed");
    }
  });

  it("treats a refused login or a refused account as setup, which waits for the settings", () => {
    for (const err of [
      smtp(535, "535 Authentication failed", { code: "EAUTH" }),
      smtp(530, "530 Authentication required"),
      smtp(550, "550 The makemymarriage.cyou domain is not verified. Please verify your domain."),
      smtp(550, "550 You can only send testing emails to your own email address"),
      smtp(550, "550 This API key is restricted and cannot send from that domain"),
      smtp(550, "550 The from address does not match a verified domain"),
      Object.assign(new Error("Domain not verified"), { code: "EENVELOPE", responseCode: 550 }),
    ]) {
      const failure = toMailError(err);
      expect(failure.kind, String((err as Error).message)).toBe("setup");
      expect(failure.retryAfterSeconds).toBe(300);
    }
  });

  it("treats the provider's daily or monthly allowance as quota, not as a short wait", () => {
    for (const err of [
      new Error("daily_quota_exceeded"),
      new Error("monthly_quota_exceeded"),
      smtp(451, "451 You have reached your daily email sending quota"),
      smtp(550, "550 Monthly email limit reached for this account"),
      smtp(429, "429 Daily limit exceeded"),
    ]) {
      expect(toMailError(err).kind, String((err as Error).message)).toBe("quota");
    }
    // A per-second limit and one recipient's full mailbox are neither.
    expect(toMailError(smtp(429, "429 Too many requests, 2 per second")).kind).toBe("temporary");
    expect(toMailError(smtp(552, "552 Mailbox quota exceeded")).kind).toBe("rejected");
  });

  it("keeps none of the provider's words: no address, no key", () => {
    const err = toMailError(
      smtp(550, "550 5.1.1 guest@example.com is unknown (key re_SECRET_api_key_123)"),
    );
    expect(err).toBeInstanceOf(MailError);
    expect(JSON.stringify([err.message, err.code, err.kind, err.stack ?? ""])).not.toMatch(
      /guest@example|re_SECRET/,
    );
    expect(err.code).toBe("550");
    expect((err as { cause?: unknown }).cause).toBeUndefined();
  });

  it("gives the daily place back and logs nothing when a send fails", async () => {
    setEmailEnv(RESEND);
    sendMailSpy.mockRejectedValueOnce(
      smtp(450, "450 slow down for guest@example.com using re_SECRET_api_key_123"),
    );
    const err = await sendMail(mail).catch((e) => e);
    expect(err).toMatchObject({ name: "MailError", kind: "temporary", code: "450" });
    expect(err.message).not.toMatch(/guest@example|re_SECRET/);
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(0);
    expect(logged()).not.toMatch(/guest@example|re_SECRET/);
  });
});

describe("what sendMail does with each failure", () => {
  const smtp = (responseCode: number, response: string) =>
    Object.assign(new Error(response), { responseCode, response });

  beforeEach(() => setEmailEnv(RESEND));

  it("keeps the daily place when the outcome is unknown, because the email may have gone out", async () => {
    sendMailSpy.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { code: "ETIMEDOUT", command: "DATA" }),
    );
    await expect(sendMail(mail)).rejects.toMatchObject({ kind: "failed" });
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(1);
  });

  it("gives the place back for every refusal, where nothing was delivered", async () => {
    for (const err of [
      smtp(450, "450 slow down"),
      smtp(550, "550 5.1.1 unknown"),
      smtp(535, "535 Authentication failed"),
    ]) {
      sendMailSpy.mockRejectedValueOnce(err);
      await expect(sendMail(mail)).rejects.toBeInstanceOf(MailError);
    }
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(0);
  });

  it("answers the provider's own quota as EMAIL_CAP_REACHED, so a send pauses like at our cap", async () => {
    sendMailSpy.mockRejectedValueOnce(
      smtp(451, "451 You have reached your daily email sending quota"),
    );
    const err = await sendMail(mail).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("EMAIL_CAP_REACHED");
    expect(await RateLimit.countDocuments({ key: "email:daily" })).toBe(0);
  });

  it("logs the problem for the operator without the key, the address or the provider's words", async () => {
    sendMailSpy.mockRejectedValueOnce(
      smtp(535, "535 key re_SECRET_api_key_123 refused for guest@example.com"),
    );
    await sendMail(mail).catch(() => {});
    expect(logged()).toContain("refused our settings");
    expect(logged()).not.toMatch(/re_SECRET|guest@example/);
  });
});

describe("what a person is told when an email can't be sent", () => {
  it("a refused address is a problem with that address", () => {
    const err = apiErrorFor(new MailError("rejected", "550"));
    expect(err).toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
    expect(err.fields!.email).toMatch(/couldn't send an email to that address/);
  });

  it("anything else is 'not right now', with a time to come back, and nothing from the provider", () => {
    for (const kind of ["temporary", "setup", "failed"] as const) {
      const err = apiErrorFor(new MailError(kind, "450"));
      expect(err).toMatchObject({ code: "EMAIL_UNAVAILABLE", status: 503 });
      expect(err.message).toBe("We can't send email right now. Please try again in a few minutes.");
    }
    expect(apiErrorFor(new MailError("temporary", "450", 90)).retryAfterSeconds).toBe(90);
    expect(apiErrorFor(new MailError("failed", "ETIMEDOUT")).retryAfterSeconds).toBe(60);
  });
});

describe("review fixes: classifying what the provider says", () => {
  const smtp = (responseCode: number, response: string, extra = {}) =>
    Object.assign(new Error(response), { responseCode, response, ...extra });

  it("is not fooled by a guest address that contains a word it looks for", () => {
    for (const address of [
      "daily-limit@corp.example",
      "monthly.quota@corp.example",
      "too-many@corp.example",
      "429@corp.example",
      "domain-not-verified@corp.example",
      "api-key@corp.example",
    ]) {
      const failure = toMailError(smtp(550, `550 5.1.1 <${address}> mailbox unavailable`));
      expect(failure.kind, address).toBe("rejected");
    }
    // The same words outside an address still count.
    expect(toMailError(smtp(550, "550 Daily limit exceeded for <a@b.example>")).kind).toBe("quota");
  });

  it("counts a 'not now' about one recipient as that guest's failure, so a send cannot stall on them", () => {
    for (const code of [450, 451, 452]) {
      const failure = toMailError(
        smtp(code, `${code} mailbox busy, try later`, { command: "RCPT TO" }),
      );
      expect(failure.kind, String(code)).toBe("rejected");
    }
    // Rate limits and busy servers at any other step still wait, and so does a rate limit worded at RCPT TO.
    expect(toMailError(smtp(450, "450 try later", { command: "DATA" })).kind).toBe("temporary");
    expect(toMailError(smtp(450, "450 try later", { command: "MAIL FROM" })).kind).toBe(
      "temporary",
    );
    expect(toMailError(smtp(450, "450 Too many requests", { command: "RCPT TO" })).kind).toBe(
      "temporary",
    );
  });

  it("keeps the sending rate where a batch of 20 fits its 60 second claim", () => {
    setEmailEnv({ ...RESEND, EMAIL_SENDS_PER_SECOND: "0.5" });
    expect(emailConfig().sendsPerSecond).toBe(0.5);
    for (const bad of ["0.1", "0", "-1"]) {
      setEmailEnv({ ...RESEND, EMAIL_SENDS_PER_SECOND: bad });
      expect(() => emailConfig(), bad).toThrow(/EMAIL_SENDS_PER_SECOND/);
    }
  });
});
