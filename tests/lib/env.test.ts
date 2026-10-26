import { afterEach, describe, expect, it } from "vitest";
import { appUrl } from "@/lib/env";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("appUrl", () => {
  it("needs only APP_URL, so pages build without database or crypto secrets", () => {
    delete process.env.MONGODB_URI;
    delete process.env.JWT_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    process.env.APP_URL = "https://make-my-marriage.vercel.app";
    expect(appUrl()).toBe("https://make-my-marriage.vercel.app");
  });

  it("rejects a missing or malformed APP_URL", () => {
    process.env.APP_URL = "not a url";
    expect(() => appUrl()).toThrow(/APP_URL/);
  });
});
