import { eventChips } from "@/modules/guests/format";

/** Two event chips, then "+N" for the rest (the full list is in the tooltip). */
export function EventChips({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-xs text-ink-secondary">Not invited yet</span>;
  }
  const { shown, more } = eventChips(names);
  return (
    <div className="flex flex-wrap items-center gap-1.5" title={names.join(", ")}>
      {shown.map((name) => (
        <span
          key={name}
          className="max-w-[9rem] truncate rounded-full bg-lilac px-2.5 py-0.5 text-[11px] font-medium text-plum"
        >
          {name}
        </span>
      ))}
      {more > 0 && (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-secondary">
          +{more}
        </span>
      )}
    </div>
  );
}

/** The tag on a guest who shares an email or phone with another guest. */
export function DuplicateTag() {
  return (
    <span className="shrink-0 rounded-input border border-error-border bg-error-bg px-1.5 py-0.5 text-[10px] leading-tight font-medium text-error">
      Possible duplicate
    </span>
  );
}
