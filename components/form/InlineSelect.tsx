import { KeyboardArrowDownIcon } from "@/components/icons";

export type InlineOption = { value: string; label: string };

type Props = {
  /** The small word before the choice, such as "Event:". */
  label: string;
  value: string;
  options: InlineOption[];
  onChange: (value: string) => void;
};

/**
 * A compact filter dropdown: "Event: All events". The real control is a native select laid
 * over the pill, so the keyboard and phone pickers work.
 */
export function InlineSelect({ label, value, options, onChange }: Props) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="relative flex h-11 min-w-0 items-center gap-2 rounded-input border border-border bg-surface px-3.5 text-xs transition-colors focus-within:border-plum focus-within:ring-[3px] focus-within:ring-plum/12 hover:bg-ivory">
      <span className="shrink-0 text-ink-secondary">{label}</span>
      <span className="min-w-0 truncate font-medium text-plum">{current?.label}</span>
      <KeyboardArrowDownIcon className="size-4 shrink-0 text-ink-secondary" />
      <select
        aria-label={label.replace(/:$/, "")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
