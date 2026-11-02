"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseOutlineIcon, MenuOutlineIcon } from "@/components/icons";
import { Monogram } from "@/components/Logo";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

type Props = {
  title: string;
  user: { name: string; email: string };
  role: "admin" | "manager";
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Below the desktop width: a slim top bar, with the sections and account in a drawer. */
export function MobileNav({ title, user, role }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Following a link closes the drawer.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const trigger = opener.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "Tab" || !panel.current) return;
      // Keep Tab inside the drawer while it is open.
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const wrapFrom = e.shiftKey ? first : last;
      if (document.activeElement === wrapFrom) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="contents lg:hidden">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-ivory px-4 py-3">
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-plum hover:bg-lilac/60"
        >
          <MenuOutlineIcon className="size-6" />
        </button>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <Monogram className="size-8 shrink-0 text-base font-normal tracking-tight shadow-2xs" />
          <span className="truncate font-display text-lg text-plum">{title}</span>
        </Link>
      </div>

      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-ivory shadow-md select-none"
          >
            <div className="min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 p-4">
                <span className="min-w-0 font-display text-lg break-words text-plum">{title}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-lilac/60"
                >
                  <CloseOutlineIcon className="size-5" />
                </button>
              </div>
              <SidebarNav />
            </div>
            <UserMenu name={user.name} email={user.email} role={role} />
          </div>
        </div>
      )}
    </div>
  );
}
