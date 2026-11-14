"use client";

import { AddIcon, RemoveIcon } from "@/components/icons";
import { peopleText, stepHeadcount } from "@/modules/rsvp/page-state";

type Props = {
  labelId: string;
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
};

const button =
  "flex size-11 items-center justify-center rounded-full border border-border bg-surface text-ink transition-colors hover:bg-lilac aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-surface";

/**
 * "People coming": minus, the number, plus; from 1 to `max`. The number is a spinbutton, so the
 * arrow keys, Home and End work on it, and a polite live region says the new value after a tap.
 * At a limit the button is marked disabled but keeps focus, so a keyboard user is not thrown out.
 */
export function Stepper({ labelId, value, max, disabled, onChange }: Props) {
  const text = peopleText(value);
  const step = (delta: 1 | -1) => {
    if (!disabled) onChange(stepHeadcount(value, delta, max));
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border/80 bg-ivory/70 p-3">
      <div className="min-w-0">
        <span id={labelId} className="block text-xs font-medium text-ink">
          People coming
        </span>
        <span className="text-[11px] text-ink-secondary">Including you</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Fewer people"
          aria-disabled={disabled || value <= 1}
          onClick={() => step(-1)}
          className={button}
        >
          <RemoveIcon className="text-base" />
        </button>
        <span
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuemin={1}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={text}
          onKeyDown={(e) => {
            if (disabled) return;
            const next =
              e.key === "ArrowUp" || e.key === "ArrowRight"
                ? stepHeadcount(value, 1, max)
                : e.key === "ArrowDown" || e.key === "ArrowLeft"
                  ? stepHeadcount(value, -1, max)
                  : e.key === "Home"
                    ? 1
                    : e.key === "End"
                      ? max
                      : null;
            if (next === null) return;
            e.preventDefault();
            onChange(next);
          }}
          className="min-w-6 rounded text-center text-sm font-semibold text-ink"
        >
          {value}
        </span>
        <button
          type="button"
          aria-label="More people"
          aria-disabled={disabled || value >= max}
          onClick={() => step(1)}
          className={button}
        >
          <AddIcon className="text-base" />
        </button>
        <span className="sr-only" aria-live="polite">
          {text}
        </span>
      </div>
    </div>
  );
}
