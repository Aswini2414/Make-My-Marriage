import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { Monogram } from "@/components/Logo";

// The slim frame around the "Create your wedding" screens: wordmark and log out on top,
// copyright below, and the step in between.

export function OnboardingShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ivory">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Monogram className="size-8 text-xs font-normal" />
          <span className="font-display text-lg text-plum">Make My Marriage</span>
        </div>
        <div className="flex min-w-0 items-center gap-4 text-xs">
          <span className="truncate text-ink-secondary">
            Signed in as <strong className="font-medium text-ink">{email}</strong>
          </span>
          <LogoutButton className="tap-area shrink-0 font-medium text-plum hover:underline disabled:opacity-60" />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">{children}</main>
      <footer className="border-t border-border px-8 py-3 text-center text-[11px] text-ink-secondary">
        © {new Date().getFullYear()} Make My Marriage. All rights reserved.
      </footer>
    </div>
  );
}
