"use client";

import { useEffect, useRef, useState } from "react";
import { KeyboardArrowDownIcon } from "@/components/icons";
import { EventChecklist } from "./EventChecklist";

type Props = {
  count: number;
  /** Guests on the current page, and in the whole filtered list, for the "only this page" note. */
  pageCount: number;
  total: number;
  names: string[];
  events: { id: string; name: string }[];
  busy: boolean;
  onApply: (mode: "add" | "remove", eventIds: string[]) => void;
  onDelete: () => void;
  onClear: () => void;
};

const pill =
  "flex h-11 items-center gap-1.5 rounded-full bg-surface/10 px-4 text-xs font-medium text-surface transition-colors hover:bg-surface/20 disabled:pointer-events-none disabled:opacity-50 sm:h-9";

function EventPopover({
  mode,
  count,
  events,
  busy,
  onApply,
}: {
  mode: "add" | "remove";
  count: number;
  events: Props["events"];
  busy: boolean;
  onApply: (eventIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("input")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = mode === "add" ? "Assign to event" : "Remove from event";
  const guests = `${count} ${count === 1 ? "guest" : "guests"}`;
  return (
    // On a phone the popover is as wide as the bar (the bar is its anchor); from `sm` it hangs
    // under its own button.
    <div ref={root} className="sm:relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={busy || events.length === 0}
        onClick={() => {
          setChosen([]);
          setOpen((o) => !o);
        }}
        className={pill}
      >
        {label}
        <KeyboardArrowDownIcon className="size-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-2 rounded-input sm:inset-x-auto sm:right-0 sm:w-64 border border-border bg-surface p-3 text-ink shadow-md"
        >
          <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-ink-secondary uppercase">
            {mode === "add" ? `Assign ${guests} to:` : `Remove ${guests} from:`}
          </p>
          <div className="max-h-60 overflow-y-auto">
            <EventChecklist
              name={`bulk-${mode}`}
              layout="list"
              events={events}
              value={chosen}
              onChange={setChosen}
            />
          </div>
          <div className="mt-2 flex justify-end border-t border-border pt-3">
            <button
              type="button"
              disabled={chosen.length === 0 || busy}
              onClick={() => {
                setOpen(false);
                onApply(chosen);
              }}
              className="flex h-11 items-center rounded-full bg-plum px-5 text-xs font-medium text-ivory transition-colors hover:bg-plum-hover disabled:pointer-events-none disabled:opacity-50 sm:h-9"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The plum bar that appears while guests are selected. */
export function BulkBar({
  count,
  pageCount,
  total,
  names,
  events,
  busy,
  onApply,
  onDelete,
  onClear,
}: Props) {
  const onlyPage = total > pageCount && count === pageCount;
  return (
    <div
      role="region"
      aria-label="Actions for selected guests"
      className="relative rounded-card bg-plum px-4 py-3 text-surface shadow-card sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-sm font-semibold whitespace-nowrap" aria-live="polite">
            {count} selected
          </span>
          {names.length > 0 && (
            <span className="hidden min-w-0 truncate border-l border-surface/20 pl-3 text-xs text-champagne-light xl:block">
              {names.slice(0, 3).join(", ")}
              {names.length > 3 ? ` and ${names.length - 3} more` : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EventPopover
            mode="add"
            count={count}
            events={events}
            busy={busy}
            onApply={(ids) => onApply("add", ids)}
          />
          <EventPopover
            mode="remove"
            count={count}
            events={events}
            busy={busy}
            onApply={(ids) => onApply("remove", ids)}
          />
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="flex h-11 items-center rounded-full bg-error px-4 text-xs font-medium text-surface transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-50 sm:h-9"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="flex h-11 items-center px-3 text-xs font-medium text-champagne-light transition-colors hover:text-surface disabled:opacity-50 sm:h-9"
          >
            Clear
          </button>
        </div>
      </div>
      {onlyPage && (
        <p className="mt-2 text-[11px] text-champagne-light">
          Only the {pageCount} guests on this page are selected, not all {total}.
        </p>
      )}
    </div>
  );
}
