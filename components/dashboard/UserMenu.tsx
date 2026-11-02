"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDownOutlineIcon } from "@/components/icons";
import { LogoutButton } from "@/components/LogoutButton";

type Props = { name: string; email: string; role: "admin" | "manager" };

/** The signed-in person at the foot of the sidebar. Opens a small menu with Log out. */
export function UserMenu({ name, email, role }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative border-t border-border/60 bg-surface/40 p-3.5">
      {open && (
        <div className="absolute right-3.5 bottom-full left-3.5 mb-1 rounded-lg border border-border bg-surface p-1 shadow-md">
          <Link
            href="/settings"
            className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium text-ink hover:bg-lilac/60"
          >
            Wedding details
          </Link>
          <LogoutButton className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-ink hover:bg-lilac/60 disabled:opacity-60" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-lilac/40"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-plum text-xs font-medium text-surface"
          >
            {name.trim()[0]?.toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-ink">{name}</span>
              <span className="rounded-full border border-champagne px-1.5 text-[9px] font-medium tracking-wide text-champagne-deep uppercase">
                {role}
              </span>
            </span>
            <span className="block truncate text-[10px] text-ink-secondary">{email}</span>
          </span>
        </span>
        <ChevronDownOutlineIcon
          strokeWidth={2}
          className="size-3.5 shrink-0 text-ink-secondary transition-colors group-hover:text-plum"
        />
      </button>
    </div>
  );
}
