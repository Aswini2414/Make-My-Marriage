import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldErrors, postJson, safeNext, waitText } from "@/lib/api-client";
import { loginSchema, resetPasswordSchema, signupSchema } from "@/modules/auth/schema";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("a page left open after the session or membership ended", () => {
  const failure = (code: string, status: number) =>
    stubFetch(Response.json({ error: { code, message: "x" } }, { status }));

  it("goes to /api/auth/clear on NOT_AUTHENTICATED and /onboarding on NO_WORKSPACE", async () => {
    const win = { location: { href: "" } };
    vi.stubGlobal("window", win);
    failure("NOT_AUTHENTICATED", 401);
    await postJson("/api/x", {});
    expect(win.location.href).toBe("/api/auth/clear");
    failure("NO_WORKSPACE", 403);
    await postJson("/api/x", {});
    expect(win.location.href).toBe("/onboarding");
  });

  it("stays put for ordinary errors such as a wrong password", async () => {
    const win = { location: { href: "" } };
    vi.stubGlobal("window", win);
    failure("INVALID_CREDENTIALS", 401);
    await postJson("/api/x", {});
    expect(win.location.href).toBe("");
  });
});

describe("postJson()", () => {
  it("sends JSON and returns the parsed body", async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));
    const res = await postJson("/api/x", { a: 1 });
    expect(res).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("treats 204 as success with no body", async () => {
    stubFetch(new Response(null, { status: 204 }));
    expect(await postJson("/api/x", {})).toEqual({ ok: true, data: null });
  });

  it("returns the API error shape, with Retry-After on a 429", async () => {
    stubFetch(
      Response.json(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
        { status: 429, headers: { "retry-after": "90" } },
      ),
    );
    expect(await postJson("/api/x", {})).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many attempts. Try again later.",
        fields: undefined,
        retryAfter: 90,
      },
    });
  });

  it("keeps field errors from a 400", async () => {
    stubFetch(
      Response.json(
        { error: { code: "VALIDATION_FAILED", message: "Fix.", fields: { email: "Bad." } } },
        { status: 400 },
      ),
    );
    const res = await postJson("/api/x", {});
    expect(res.ok === false && res.error.fields).toEqual({ email: "Bad." });
  });

  it("answers a plain error when the server returns something that isn't JSON", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const res = await postJson("/api/x", {});
    expect(res.ok === false && res.error.code).toBe("SERVER_ERROR");
  });

  it("answers NETWORK when the request never arrives", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    const res = await postJson("/api/x", {});
    expect(res.ok === false && res.error.code).toBe("NETWORK");
  });
});

describe("waitText()", () => {
  it("describes waits in plain words", () => {
    expect(waitText(30)).toBe("a minute");
    expect(waitText(15 * 60)).toBe("15 minutes");
    expect(waitText(59 * 60)).toBe("an hour");
    expect(waitText(3600)).toBe("an hour");
    expect(waitText(undefined)).toBe("an hour");
  });
});

describe("safeNext()", () => {
  it("allows only paths on this site", () => {
    expect(safeNext("/guests?x=1")).toBe("/guests?x=1");
    for (const bad of [
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "guests",
    ]) {
      expect(safeNext(bad)).toBeUndefined();
    }
  });
});

describe("account form checks (shared with the server)", () => {
  it("name, email and password messages match the Stitch designs", () => {
    const result = signupSchema.safeParse({ name: "", email: "nope", password: "12345" });
    expect(result.success).toBe(false);
    expect(!result.success && fieldErrors(result.error)).toEqual({
      name: "Enter your name.",
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
    });
  });

  it("trims the name and lowercases the email", () => {
    expect(
      signupSchema.parse({ name: "  Radha ", email: " Radha@Example.COM ", password: "12345678" }),
    ).toEqual({ name: "Radha", email: "radha@example.com", password: "12345678" });
  });

  it("accepts exactly 8 characters and refuses more than 72 bytes", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", password: "12345678" }).success).toBe(true);
    const long = resetPasswordSchema.safeParse({ token: "t", password: "a".repeat(73) });
    expect(!long.success && fieldErrors(long.error).password).toBe("Use at most 72 characters.");
  });

  it("does not apply the length rule when logging in", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
