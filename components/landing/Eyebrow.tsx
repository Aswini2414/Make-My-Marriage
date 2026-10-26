import type { ReactNode } from "react";

// Small labels above landing page section titles.

/** A champagne dot, then uppercase text. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-champagne-deep uppercase">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-champagne" />
      {children}
    </p>
  );
}

/** Uppercase text in a white pill. "soft" is the translucent version used on lilac. */
export function PillEyebrow({ children, soft = false }: { children: ReactNode; soft?: boolean }) {
  return (
    <p
      className={`mb-3 inline-flex items-center gap-2 rounded-full border border-champagne/40 px-3 py-1 font-semibold tracking-[0.2em] text-champagne-deep uppercase ${
        soft ? "bg-surface/70 text-[10px] md:text-xs" : "bg-surface text-xs"
      }`}
    >
      {children}
    </p>
  );
}
