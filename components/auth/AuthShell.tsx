import Link from "next/link";
import type { ReactNode } from "react";

// The split screen shared by every account page: a plum panel with the brand and a short
// pitch, and an ivory side for the form. On phones the plum panel shrinks to a brand bar.

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3.5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-champagne/40 font-display text-xl text-champagne italic select-none"
      >
        Mm
      </span>
      <span className="font-display text-2xl tracking-tight text-ivory">Make My Marriage</span>
    </Link>
  );
}

export function AuthShell({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="bg-plum px-6 py-5 md:hidden">
        <Brand />
      </header>
      <aside className="hidden min-h-screen flex-col justify-between bg-plum p-14 text-ivory md:flex md:w-[45%] lg:p-16">
        <Brand />
        <div className="my-auto max-w-lg py-12">{panel}</div>
        <p className="text-xs text-ivory/50">© 2026 Make My Marriage</p>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-ivory px-6 py-12 md:w-[55%] md:py-20 lg:px-16">
        <div className="flex w-full max-w-[400px] flex-col">{children}</div>
      </main>
    </div>
  );
}
