"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/api-client";

/** Ends the session and returns to the login page. Styled by the caller. */
export function LogoutButton({
  className,
  redirectTo = "/login",
}: {
  className?: string;
  /** Where to go afterwards, such as the invite page the person is looking at. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    await postJson("/api/auth/logout", {});
    // Leave the page even if the call failed: the next request shows whether the
    // session is still alive.
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} disabled={pending} className={className}>
      Log out
    </button>
  );
}
