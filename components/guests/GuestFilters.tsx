"use client";

import { InlineSelect } from "@/components/form/InlineSelect";
import { SearchIcon } from "@/components/icons";
import type { HouseholdItem } from "@/modules/guests/types";

type Props = {
  /** The search box's own text, which updates as you type. */
  query: string;
  eventId?: string;
  household?: string;
  events: { id: string; name: string }[];
  households: HouseholdItem[];
  onQuery: (query: string) => void;
  onEvent: (eventId: string) => void;
  onHousehold: (household: string) => void;
};

/** Search, Event and Household. (The "Replied" filter arrives with RSVPs in Phase 4.) */
export function GuestFilters({
  query,
  eventId,
  household,
  events,
  households,
  onQuery,
  onEvent,
  onHousehold,
}: Props) {
  // A household in the address bar that no guest has any more still shows as chosen.
  const householdOptions = households.some((h) => h.name === household)
    ? households
    : household
      ? [...households, { name: household, count: 0 }]
      : households;
  return (
    <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center lg:gap-3">
      <div className="relative col-span-2 min-w-0 lg:flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-secondary" />
        <input
          type="search"
          aria-label="Search guests"
          placeholder="Search by name, phone or email"
          autoComplete="off"
          maxLength={100}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="h-11 w-full rounded-input border border-border bg-surface pr-3 pl-10 text-sm text-ink transition-colors placeholder:text-ink-secondary/70 focus:border-plum focus:ring-[3px] focus:ring-plum/12 focus:outline-none"
        />
      </div>
      <InlineSelect
        label="Event:"
        value={eventId ?? ""}
        onChange={onEvent}
        options={[
          { value: "", label: "All events" },
          ...events.map((e) => ({ value: e.id, label: e.name })),
        ]}
      />
      <InlineSelect
        label="Household:"
        value={household ?? ""}
        onChange={onHousehold}
        options={[
          { value: "", label: "All" },
          ...householdOptions.map((h) => ({ value: h.name, label: h.name })),
        ]}
      />
    </div>
  );
}
