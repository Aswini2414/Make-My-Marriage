import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handler, json, parseBody } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";

const APP = "http://localhost:3000";

function post(body: unknown, origin: string | null = APP) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest(`${APP}/api/test`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const route = handler(async (req) => {
  const { email } = await parseBody(
    req,
    z.object({ email: z.email("Enter a valid email address.") }),
  );
  return json({ email }, 201);
});

describe("handler()", () => {
  it("passes valid writes from the app's own origin", async () => {
    const res = await route(post({ email: "leela@example.com" }), undefined);
    expect(res.status).toBe(201);
  });

  it("refuses writes from another origin or with no origin", async () => {
    for (const origin of ["https://evil.example", null]) {
      const res = await route(post({ email: "a@b.co" }, origin), undefined);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: { code: "FORBIDDEN_ORIGIN", message: "This request isn't allowed." },
      });
    }
  });

  it("refuses a body over 100 KB with a validation error", async () => {
    const res = await route(post({ email: "a@b.co", padding: "x".repeat(150_000) }), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "The request is too large.",
    });
  });

  it("cuts off a body with no Content-Length once it passes 100 KB, counted in bytes", async () => {
    // 40,000 three-byte characters are 120,000 bytes but only 40,000 characters long.
    const body = JSON.stringify({ email: "a@b.co", padding: "€".repeat(40_000) });
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 60_000));
        controller.enqueue(bytes.slice(60_000));
        controller.close();
      },
    });
    const req = new NextRequest(`${APP}/api/test`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP },
      body: stream,
      duplex: "half",
    } as ConstructorParameters<typeof NextRequest>[1]);
    const res = await route(req, undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("The request is too large.");
  });

  it("returns VALIDATION_FAILED with fields for bad input", async () => {
    const res = await route(post({ email: "bad-email" }), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "Some fields need fixing.",
        fields: { email: "Enter a valid email address." },
      },
    });
  });

  it("returns ApiErrors in the error shape, with Retry-After when set", async () => {
    const limited = handler(async () => {
      throw new ApiError("RATE_LIMITED", undefined, { retryAfterSeconds: 60 });
    });
    const res = await limited(new NextRequest(`${APP}/api/test`), undefined);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
  });

  it("hides unexpected errors behind SERVER_ERROR", async () => {
    const broken = handler(async () => {
      throw new Error("secret stack details");
    });
    const res = await broken(new NextRequest(`${APP}/api/test`), undefined);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("toObjectId()", () => {
  it("accepts 24-character hex IDs and answers 404 for anything else", () => {
    expect(toObjectId("6718f2a9c1e4b5a3d2f10a77").toHexString()).toBe("6718f2a9c1e4b5a3d2f10a77");
    for (const bad of ["123", "zzzzzzzzzzzzzzzzzzzzzzzz", "abcdefghijkl"]) {
      expect(() => toObjectId(bad)).toThrow(ApiError);
    }
  });
});
