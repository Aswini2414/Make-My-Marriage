"use client";

import { useEffect, useRef, useState } from "react";
import { DeleteIcon, MoreVertIcon } from "@/components/icons";

/** About the height of the open menu (two items), used to decide whether it fits below. */
const MENU_HEIGHT = 104;

const itemClass =
  "flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-lilac focus-visible:bg-lilac focus-visible:outline-none";

/** The three-dot menu on a list row or card: Edit and Delete. Used by Events and Guests. */
export function RowMenu({
  focusKey,
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  /** Set on the trigger as data-focus-return, so a drawer can hand focus back to this row. */
  focusKey?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The menu is `fixed`, placed from the button's position, so a list card with
  // `overflow-hidden` cannot clip it. It opens upward when there is no room below.
  const [place, setPlace] = useState<{ top?: number; bottom?: number; right: number }>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      } else if (e.key === "Tab") setOpen(false);
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // A fixed menu would stay behind while the page moves, so it closes instead.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        data-focus-return={focusKey}
        type="button"
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          const box = trigger.current?.getBoundingClientRect();
          if (box) {
            const right = Math.max(8, window.innerWidth - box.right);
            setPlace(
              box.bottom + MENU_HEIGHT + 8 > window.innerHeight
                ? { bottom: window.innerHeight - box.top + 4, right }
                : { top: box.bottom + 4, right },
            );
          }
          setOpen((o) => !o);
        }}
        className="flex size-11 items-center justify-center rounded-full text-ink-secondary transition-colors hover:text-plum lg:size-9"
      >
        <MoreVertIcon className="text-lg" />
      </button>
      {open && (
        <div
          role="menu"
          style={place}
          className="fixed z-20 w-40 overflow-hidden rounded-input border border-border bg-surface py-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-ink`}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-error`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <DeleteIcon className="text-base" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
