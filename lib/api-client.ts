import type { ZodError } from "zod";

// Browser-side helpers for calling our own API from forms. No server-only imports.

export type ApiFailure = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  /** Seconds to wait, from the Retry-After header on a 429. */
  retryAfter?: number;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

/**
 * A page left open after the session ended or the person was removed from the wedding
 * would keep showing data it can no longer use, so move on to where they belong.
 * /api/auth/clear also removes the dead cookie, which stops /login bouncing them back.
 */
function leaveDeadPage(code: string | undefined) {
  if (typeof window === "undefined") return;
  // A full page load (not router.push), because /api/auth/clear is a route, not a page.
  /* eslint-disable @next/next/no-location-assign-relative-destination */
  if (code === "NOT_AUTHENTICATED") window.location.href = "/api/auth/clear";
  else if (code === "NO_WORKSPACE") window.location.href = "/onboarding";
  /* eslint-enable @next/next/no-location-assign-relative-destination */
}

/** Sends JSON. The browser adds the Origin header and the session cookie. */
async function sendJson<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true, data: (res.status === 204 ? null : await res.json()) as T };
    const retryAfter = Number(res.headers.get("retry-after")) || undefined;
    const { error } = await res.json().catch(() => ({ error: undefined }));
    leaveDeadPage(error?.code);
    return {
      ok: false,
      error: {
        code: error?.code ?? "SERVER_ERROR",
        message: error?.message ?? "Something went wrong. Please try again.",
        fields: error?.fields,
        retryAfter,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK",
        message: "We couldn't reach the server. Check your connection and try again.",
      },
    };
  }
}

export const getJson = <T = unknown>(path: string) => sendJson<T>("GET", path);
export const postJson = <T = unknown>(path: string, body: unknown = {}) =>
  sendJson<T>("POST", path, body);
export const patchJson = <T = unknown>(path: string, body: unknown) =>
  sendJson<T>("PATCH", path, body);
export const deleteJson = <T = unknown>(path: string, body?: unknown) =>
  sendJson<T>("DELETE", path, body);

/** { field: first message } from a Zod error, for showing the same checks the server runs. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "_")] ??= issue.message;
  return fields;
}

/** "an hour", "12 minutes": how long to wait, for rate-limit messages. */
export function waitText(seconds = 3600): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) return "a minute";
  if (minutes < 55) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "an hour" : `${hours} hours`;
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(next: string | undefined): string | undefined {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : undefined;
}
