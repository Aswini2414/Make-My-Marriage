"use client";

import { RowMenu } from "@/components/ui/RowMenu";
import { guestEventNames } from "@/modules/guests/format";
import { DuplicateTag, EventChips } from "./GuestParts";
import type { GuestListProps } from "./GuestTable";

/** The guest list as stacked cards, below 1024px. */
export function GuestCards({
  items,
  events,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: GuestListProps) {
  return (
    <ul className="divide-y divide-border/70 lg:hidden">
      {items.map((guest) => {
        const on = selected.has(guest.id);
        return (
          <li
            key={guest.id}
            className={`flex items-start gap-1 py-3 pr-1 pl-1 ${on ? "bg-lilac/40" : ""}`}
          >
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                aria-label={`Select ${guest.name}`}
                checked={on}
                onChange={() => onToggle(guest.id)}
                className="size-[18px] cursor-pointer accent-plum"
              />
            </label>
            <div className="min-w-0 flex-1 py-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 truncate text-sm font-medium text-ink">{guest.name}</span>
                {guest.duplicate && <DuplicateTag />}
              </div>
              {(guest.relation || guest.household) && (
                <p className="mt-0.5 text-xs break-words text-ink-secondary">
                  {[guest.relation, guest.household].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-2 flex flex-col gap-0.5 text-xs text-ink-body">
                {guest.phone && <span className="whitespace-nowrap">{guest.phone}</span>}
                {guest.email && (
                  <span className="truncate" title={guest.email}>
                    {guest.email}
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <EventChips names={guestEventNames(guest.eventIds, events)} />
              </div>
            </div>
            <RowMenu
              focusKey={guest.id}
              name={guest.name}
              onEdit={() => onEdit(guest)}
              onDelete={() => onDelete(guest)}
            />
          </li>
        );
      })}
    </ul>
  );
}
