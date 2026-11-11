"use client";

import { CheckIcon } from "@/components/icons";

type Props = {
  events: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** "grid" is two columns, as in the drawer; "list" is one column, as in the bulk popover. */
  layout?: "grid" | "list";
  /** Makes the checkbox names unique when two lists are on one page. */
  name: string;
  disabled?: boolean;
};

/** One checkbox per event. Used by the guest drawer and the bulk Assign / Remove popovers. */
export function EventChecklist({
  events,
  value,
  onChange,
  layout = "grid",
  name,
  disabled,
}: Props) {
  const chosen = new Set(value);
  const toggle = (id: string) =>
    onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <ul
      className={
        layout === "grid" ? "grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" : "flex flex-col"
      }
    >
      {events.map((event) => {
        const on = chosen.has(event.id);
        return (
          <li
            key={event.id}
            className={layout === "grid" && events.length % 2 === 1 ? "last:col-span-full" : ""}
          >
            <label
              className={
                layout === "grid"
                  ? `flex min-h-12 cursor-pointer items-center gap-3 rounded-input border px-3.5 text-sm text-ink transition-colors focus-within:ring-[3px] focus-within:ring-plum/12 ${
                      on ? "border-border bg-lilac" : "border-border bg-surface hover:bg-ivory"
                    }`
                  : "flex min-h-11 cursor-pointer items-center gap-3 rounded-input px-2 text-sm text-ink hover:bg-ivory"
              }
            >
              <input
                type="checkbox"
                name={name}
                value={event.id}
                checked={on}
                disabled={disabled}
                onChange={() => toggle(event.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-plum/25 ${
                  on ? "border-plum bg-plum text-ivory" : "border-mauve bg-surface"
                }`}
              >
                {on && <CheckIcon className="size-3.5" />}
              </span>
              <span className="min-w-0 break-words">{event.name}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
