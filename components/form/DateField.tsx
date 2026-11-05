"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { CalendarOutlineIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";
import { DatePicker } from "./DatePicker";
import { describe, FieldFrame, inputClass } from "./Field";

type Props = {
  id: string;
  label: ReactNode;
  /** YYYY-MM-DD, or empty while nothing is chosen. */
  value: string;
  /** Today, as YYYY-MM-DD (from the server, so it is India time). */
  today: string;
  onChange: (date: string) => void;
  error?: string;
  hint?: string;
  caps?: boolean;
  optional?: boolean;
  placeholder?: string;
  /** Earliest and latest day that can be picked. */
  min?: string;
  max?: string;
};

/**
 * A date field that shows "18 Oct 2026" and opens the same calendar as onboarding under it.
 * It is a button, not a text box, so there is nothing to mistype.
 */
export function DateField({
  id,
  label,
  value,
  today,
  onChange,
  error,
  hint,
  caps,
  optional,
  placeholder = "Choose a date",
  min,
  max,
}: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);

  // While the calendar is open: Escape closes just the calendar (not a drawer around it), and
  // so does a click or tap anywhere outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase on window, so the drawer's own Escape handler never sees this key.
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!picker.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} caps={caps} optional={optional}>
      <button
        ref={button}
        id={id}
        type="button"
        aria-expanded={open}
        {...describe(id, error, hint)}
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass(!!error)} flex items-center justify-between text-left ${
          value ? "" : "text-ink-secondary/70"
        }`}
      >
        <span>{value ? formatShortDate(value) : placeholder}</span>
        <CalendarOutlineIcon className="size-5 text-ink-secondary" />
      </button>
      {open && (
        // `contents` gives the wrapper no box of its own, so the calendar's layout is unchanged.
        <div ref={picker} className="contents">
          <DatePicker
            value={value}
            today={today}
            min={min}
            max={max}
            onChange={(date) => {
              onChange(date);
              setOpen(false);
            }}
          />
        </div>
      )}
    </FieldFrame>
  );
}
