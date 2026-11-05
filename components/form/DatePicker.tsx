"use client";

import { type KeyboardEvent, useState } from "react";
import { ChevronLeftOutlineIcon, ChevronRightOutlineIcon } from "@/components/icons";
import { formatDate, weddingDateBounds } from "@/lib/dates";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAME = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const pad = (n: number) => String(n).padStart(2, "0");

type Props = {
  /** YYYY-MM-DD, or empty while nothing is chosen. */
  value: string;
  /** Today, as YYYY-MM-DD. Its month shows first when nothing is chosen. */
  today: string;
  onChange: (date: string) => void;
  /** Earliest and latest day that can be picked. Defaults to the wedding date range. */
  min?: string;
  max?: string;
};

/** A month grid that picks one calendar day. Weeks start on Sunday, as in the design. */
export function DatePicker({ value, today, onChange, min: minProp, max: maxProp }: Props) {
  const bounds = weddingDateBounds(today);
  const min = minProp ?? bounds.min;
  const max = maxProp ?? bounds.max;
  const start = value || today;
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7))); // 1 to 12

  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = first.getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevLength = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();

  // Months before the earliest or after the latest allowed date have nothing to pick.
  const canGo = (by: number) => {
    const next = new Date(Date.UTC(year, month - 1 + by, 1));
    const key = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
    return by < 0 ? key >= min.slice(0, 7) : key <= max.slice(0, 7);
  };

  function shift(by: number) {
    if (!canGo(by)) return;
    const next = new Date(Date.UTC(year, month - 1 + by, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  // Page Up and Page Down change the month; with Shift, the year.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "PageUp" && e.key !== "PageDown") return;
    e.preventDefault();
    shift((e.key === "PageUp" ? -1 : 1) * (e.shiftKey ? 12 : 1));
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="mt-4 max-w-sm rounded-xl border border-border bg-surface p-4 shadow-md"
    >
      <div className="mb-3 flex items-center justify-between border-b border-lilac pb-2">
        <span aria-live="polite" className="font-display text-base text-ink">
          {MONTH_NAME.format(first)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-12)}
            disabled={!canGo(-12)}
            aria-label="Previous year"
            className="rounded px-1.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ivory disabled:opacity-30"
          >
            -1y
          </button>
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canGo(-1)}
            aria-label="Previous month"
            className="rounded p-1 text-ink-secondary hover:bg-ivory disabled:opacity-30"
          >
            <ChevronLeftOutlineIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={!canGo(1)}
            aria-label="Next month"
            className="rounded p-1 text-ink-secondary hover:bg-ivory disabled:opacity-30"
          >
            <ChevronRightOutlineIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shift(12)}
            disabled={!canGo(12)}
            aria-label="Next year"
            className="rounded px-1.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ivory disabled:opacity-30"
          >
            +1y
          </button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wider text-ink-secondary uppercase">
        {DAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`lead-${i}`} className="py-1 text-mauve" aria-hidden="true">
            {prevLength - leading + i + 1}
          </span>
        ))}
        {Array.from({ length }, (_, i) => {
          const iso = `${year}-${pad(month)}-${pad(i + 1)}`;
          const selected = iso === value;
          const outOfRange = iso < min || iso > max;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              disabled={outOfRange}
              aria-pressed={selected}
              aria-label={formatDate(iso)}
              className={
                selected
                  ? "rounded-full bg-plum py-1 font-semibold text-ivory shadow-sm"
                  : "rounded-full py-1 text-ink hover:bg-lilac disabled:text-mauve disabled:hover:bg-transparent"
              }
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
