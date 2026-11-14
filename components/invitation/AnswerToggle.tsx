"use client";

type Props = {
  /** Unique per event: ties the radios together. */
  name: string;
  labelledBy: string;
  describedBy?: string;
  value: boolean | null;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (attending: boolean) => void;
};

const OPTIONS = [
  { attending: true, label: "Attending" },
  { attending: false, label: "Not attending" },
] as const;

/**
 * Attending / Not attending as a radio group: arrow keys, Tab and screen readers all work as
 * they do for any radio buttons. Each half is at least 44px tall and the control fills the card.
 */
export function AnswerToggle({
  name,
  labelledBy,
  describedBy,
  value,
  invalid,
  disabled,
  onChange,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`grid grid-cols-2 rounded-full border bg-ivory p-1 text-xs font-medium ${
        invalid ? "border-error-border" : "border-border"
      }`}
    >
      {OPTIONS.map((o) => (
        <label key={o.label} className="relative block">
          <input
            type="radio"
            id={`${name}-${o.attending ? "yes" : "no"}`}
            name={name}
            checked={value === o.attending}
            disabled={disabled}
            onChange={() => onChange(o.attending)}
            className="peer sr-only"
          />
          <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-ink-secondary transition-colors peer-checked:bg-plum peer-checked:text-surface peer-checked:shadow-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-plum peer-disabled:cursor-default hover:text-ink peer-checked:hover:text-surface">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
