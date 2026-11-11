"use client";

import { RowMenu } from "@/components/ui/RowMenu";
import { guestEventNames } from "@/modules/guests/format";
import type { GuestItem } from "@/modules/guests/types";
import { DuplicateTag, EventChips } from "./GuestParts";

export type GuestListProps = {
  items: GuestItem[];
  events: { id: string; name: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onEdit: (guest: GuestItem) => void;
  onDelete: (guest: GuestItem) => void;
};

const head =
  "px-3 py-3.5 text-left text-[11px] font-semibold tracking-wider text-ink-secondary uppercase";
const box = "size-[18px] cursor-pointer accent-plum";

/** The guest list as a table, from 1024px up. Below that the cards are shown instead. */
export function GuestTable({
  items,
  events,
  selected,
  onToggle,
  onTogglePage,
  onEdit,
  onDelete,
}: GuestListProps) {
  const allOnPage = items.length > 0 && items.every((g) => selected.has(g.id));
  const someOnPage = !allOnPage && items.some((g) => selected.has(g.id));
  return (
    <table className="hidden w-full table-fixed border-collapse lg:table">
      <colgroup>
        <col className="w-14" />
        <col className="w-[19%]" />
        <col className="w-[13%]" />
        <col className="w-[142px]" />
        <col />
        <col className="w-[19%]" />
        <col className="w-14" />
      </colgroup>
      <thead className="border-b border-border bg-ivory">
        <tr>
          <th className="py-3.5 pl-5 text-left">
            <input
              type="checkbox"
              aria-label="Select all guests on this page"
              checked={allOnPage}
              ref={(el) => {
                if (el) el.indeterminate = someOnPage;
              }}
              onChange={onTogglePage}
              className={box}
            />
          </th>
          <th className={head}>Guest</th>
          <th className={head}>Household</th>
          <th className={head}>Phone</th>
          <th className={head}>Email</th>
          <th className={head}>Events</th>
          <th className={`${head} text-right`}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70">
        {items.map((guest) => {
          const on = selected.has(guest.id);
          return (
            <tr key={guest.id} className={on ? "bg-lilac/40" : "hover:bg-ivory/70"}>
              <td className="py-4 pl-5 align-middle">
                <input
                  type="checkbox"
                  aria-label={`Select ${guest.name}`}
                  checked={on}
                  onChange={() => onToggle(guest.id)}
                  className={box}
                />
              </td>
              <td className="px-3 py-4 align-middle">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="min-w-0 truncate text-sm font-medium text-ink"
                    title={guest.name}
                  >
                    {guest.name}
                  </span>
                  {guest.duplicate && <DuplicateTag />}
                </div>
                {guest.relation && (
                  <div
                    className="mt-0.5 truncate text-xs text-ink-secondary"
                    title={guest.relation}
                  >
                    {guest.relation}
                  </div>
                )}
              </td>
              <td className="px-3 py-4 align-middle text-sm text-ink-body">
                <span className="block truncate" title={guest.household}>
                  {guest.household ?? "–"}
                </span>
              </td>
              <td className="px-3 py-4 align-middle text-sm whitespace-nowrap text-ink-body">
                {guest.phone ?? "–"}
              </td>
              <td className="px-3 py-4 align-middle text-sm text-ink-body">
                <span className="block truncate" title={guest.email}>
                  {guest.email ?? "–"}
                </span>
              </td>
              <td className="px-3 py-4 align-middle">
                <EventChips names={guestEventNames(guest.eventIds, events)} />
              </td>
              <td className="py-2 pr-3 text-right align-middle">
                <div className="flex justify-end">
                  <RowMenu
                    focusKey={guest.id}
                    name={guest.name}
                    onEdit={() => onEdit(guest)}
                    onDelete={() => onDelete(guest)}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
