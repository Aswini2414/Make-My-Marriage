import { clearSession, handler, noContent } from "@/lib/api";

// Always clears the cookie, even when the session is already expired or rejected, so a
// stale cookie can't be left behind. The Origin check in handler() still applies.
export const POST = handler(async () => clearSession(noContent()));
