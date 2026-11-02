import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailSpy = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

import { ApiError } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import {
  assertUnderLimit,
  canLimitByIp,
  consume,
  HOUR,
  MINUTE,
  RateLimit,
  recordHit,
} from "@/lib/rate-limit";
import { emptyDb, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(async () => {
  await emptyDb();
  sendMailSpy.mockClear();
});
afterAll(() => mongoose.disconnect());

describe("rate limits", () => {
  it("allow up to the limit, then answer RATE_LIMITED with a wait", async () => {
    await consume("k", 2, MINUTE);
    await consume("k", 2, MINUTE);
    const err = await consume("k", 2, MINUTE).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("count each key separately", async () => {
    await consume("a", 1, MINUTE);
    await expect(consume("b", 1, MINUTE)).resolves.toBeUndefined();
  });

  it("ignore hits that fall outside the window", async () => {
    await RateLimit.create({
      key: "old",
      expiresAt: new Date(Date.now() + HOUR),
      createdAt: new Date(Date.now() - 2 * HOUR),
    });
    await expect(assertUnderLimit("old", 1, HOUR)).resolves.toBeUndefined();
  });

  it("only count recordHit, not the check", async () => {
    await assertUnderLimit("c", 1, MINUTE);
    await assertUnderLimit("c", 1, MINUTE);
    await recordHit("c", MINUTE);
    await expect(assertUnderLimit("c", 1, MINUTE)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("set expiresAt so the TTL index can clear the record", async () => {
    await recordHit("t", MINUTE);
    const doc = await RateLimit.findOne({ key: "t" }).lean();
    expect(doc!.expiresAt.getTime() - Date.now()).toBeGreaterThan(50_000);
  });
});

describe("sendMail daily cap", () => {
  const mail = { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" };

  it("sends and counts each email under gmail:daily", async () => {
    await sendMail(mail);
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    expect(sendMailSpy.mock.calls[0]![0].from).toEqual({
      name: "Make My Marriage",
      address: "sender@example.com",
    });
    expect(await RateLimit.countDocuments({ key: "gmail:daily" })).toBe(1);
  });

  it("answers EMAIL_CAP_REACHED at 450 and sends nothing", async () => {
    await RateLimit.insertMany(
      Array.from({ length: 450 }, () => ({
        key: "gmail:daily",
        expiresAt: new Date(Date.now() + HOUR),
      })),
    );
    await expect(sendMail(mail)).rejects.toMatchObject({ code: "EMAIL_CAP_REACHED", status: 429 });
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("never goes over the cap when many emails are sent at once", async () => {
    await RateLimit.insertMany(
      Array.from({ length: 448 }, () => ({
        key: "gmail:daily",
        expiresAt: new Date(Date.now() + HOUR),
      })),
    );
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => sendMail(mail)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(sendMailSpy).toHaveBeenCalledTimes(2);
    expect(await RateLimit.countDocuments({ key: "gmail:daily" })).toBe(450);
  });

  it("does not count an email that failed to send", async () => {
    sendMailSpy.mockRejectedValueOnce(new Error("SMTP down"));
    await expect(sendMail(mail)).rejects.toThrow("SMTP down");
    expect(await RateLimit.countDocuments({ key: "gmail:daily" })).toBe(0);
  });
});

describe("canLimitByIp()", () => {
  it("counts real addresses, skips local ones outside production, and counts them in production", () => {
    expect(canLimitByIp("1.2.3.4")).toBe(true);
    for (const local of ["unknown", "::1", "127.0.0.1", "::ffff:127.0.0.1"]) {
      expect(canLimitByIp(local), local).toBe(false);
    }
    vi.stubEnv("NODE_ENV", "production");
    expect(canLimitByIp("unknown")).toBe(true);
    vi.unstubAllEnvs();
  });
});
