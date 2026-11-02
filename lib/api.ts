import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { coreEnv } from "@/lib/env";
import { ApiError, errorResponse, zodToFields } from "@/lib/errors";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

const MAX_BODY_BYTES = 100_000;
const TOO_BIG = "The request is too large.";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RouteHandler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Wraps every route handler: checks Origin on writes, and turns any thrown error into
 * the API's error shape. Unknown errors become SERVER_ERROR with no details.
 */
export function handler<C = unknown>(fn: RouteHandler<C>): RouteHandler<C> {
  return async (req, ctx) => {
    try {
      if (WRITE_METHODS.has(req.method)) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err);
      if (err instanceof ZodError) {
        return errorResponse(
          new ApiError("VALIDATION_FAILED", undefined, { fields: zodToFields(err) }),
        );
      }
      console.error(`[api] ${req.method} ${redactPath(req.nextUrl.pathname)} failed`, err);
      return errorResponse(new ApiError("SERVER_ERROR"));
    }
  };
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin !== new URL(coreEnv().APP_URL).origin) throw new ApiError("FORBIDDEN_ORIGIN");
}

// Invitation and QR tokens appear in public URLs; never write them to the logs.
function redactPath(path: string) {
  return path.replace(/[A-Za-z0-9_-]{32,}/g, "[token]");
}

/** The body as text, or a validation error as soon as it passes `max` bytes. */
async function readCapped(req: Request, max: number): Promise<string> {
  if (Number(req.headers.get("content-length") ?? 0) > max) {
    throw new ApiError("VALIDATION_FAILED", TOO_BIG);
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError("VALIDATION_FAILED", TOO_BIG);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Reads and validates a JSON body. Bad JSON counts as a validation failure. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  // Real bodies here are a few hundred bytes. The cap is counted in bytes while reading,
  // so a body with no Content-Length (or a false one) is cut off instead of buffered whole.
  let data: unknown;
  try {
    data = JSON.parse(await readCapped(req, MAX_BODY_BYTES));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("VALIDATION_FAILED", "The request body must be JSON.");
  }
  return schema.parse(data);
}

/** Validates the query string against a schema. */
export function parseQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/** Sets the session cookie on a response. Used by login, signup, reset and accept-invite. */
export async function withSession<R extends NextResponse>(res: R, userId: string): Promise<R> {
  res.cookies.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions);
  return res;
}

export function clearSession<R extends NextResponse>(res: R): R {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}

/** The caller's IP from Vercel's x-forwarded-for header, for rate limits. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
