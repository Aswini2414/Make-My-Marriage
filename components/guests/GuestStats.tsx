import type { GuestSummary } from "@/modules/guests/types";

const label = "block text-[11px] font-semibold tracking-wider uppercase text-ink-secondary";
const number = "mt-2 block font-display text-3xl leading-none text-plum";
const card = "rounded-card border border-border bg-surface p-4 shadow-card sm:p-6";

/** The four numbers above the list. They always count the whole wedding, never the filters. */
export function GuestStats({ summary }: { summary: GuestSummary }) {
  const cards = [
    { label: "Total guests", value: summary.total },
    { label: "Households", value: summary.households },
    { label: "Invited to events", value: summary.invited },
    { label: "Not yet assigned", value: summary.unassigned },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {cards.map((c) => (
        <div key={c.label} className={card}>
          <span className={label}>{c.label}</span>
          <span className={number}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}
