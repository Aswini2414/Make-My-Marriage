import { afterEach, describe, expect, it } from "vitest";
import { appUrl, mongoUri } from "@/lib/env";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("mongoUri", () => {
  it("needs only MONGODB_URI, so db:indexes runs with nothing else set", () => {
    delete process.env.JWT_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.APP_URL;
    process.env.MONGODB_URI = "mongodb+srv://user:pw@cluster.example.net/mmm_prod";
    expect(mongoUri()).toBe("mongodb+srv://user:pw@cluster.example.net/mmm_prod");
  });

  it("rejects a missing or non-MongoDB connection string", () => {
    process.env.MONGODB_URI = "postgres://nope";
    expect(() => mongoUri()).toThrow(/MONGODB_URI/);
    delete process.env.MONGODB_URI;
    expect(() => mongoUri()).toThrow(/MONGODB_URI/);
  });
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
