import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { coreEnv } from "@/lib/env";
import { ApiError, errorResponse, zodToFields } from "@/lib/errors";

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

/** Reads and validates a JSON body. Bad JSON counts as a validation failure. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
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
