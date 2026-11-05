import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { PlusBoldIcon } from "@/components/icons";
import { dateTileParts, formatTime12 } from "@/lib/dates";
import { typeChipLabel } from "@/modules/events/format";
import type { UpcomingEvent } from "@/modules/dashboard/types";

/** The next few events, from today on. Past events are not listed here. */
export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  return (
    <section className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6 lg:col-span-8">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <h2 className="font-display text-[22px] text-ink">Upcoming events</h2>
        {events.length > 0 && (
          <Link href="/events" className="tap-area text-xs font-medium text-plum hover:underline">
            View all events
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-sm font-medium text-ink">No events yet</p>
          <p className="max-w-xs text-xs leading-relaxed text-ink-secondary">
            Add the haldi, the sangeet, the wedding itself, and they will show up here.
          </p>
          <ButtonLink href="/events" className="mt-1 h-11 gap-2 px-5 text-xs">
            <PlusBoldIcon strokeWidth={2} className="size-3.5" />
            Add event
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border/60">
          {events.map((event) => {
            const { day, month } = dateTileParts(event.date);
            return (
              <li key={event.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border border-border/70 bg-ivory">
                    <span className="font-display text-lg leading-none font-medium text-ink">
                      {day}
                    </span>
                    <span className="mt-0.5 text-[9px] font-semibold tracking-wider text-ink-secondary uppercase">
                      {month}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-sans text-xs font-semibold text-ink">{event.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-ink-secondary">
                      {event.venueName} · {formatTime12(event.time)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="rounded-full bg-lilac px-2.5 py-0.5 text-[10px] font-medium text-plum">
                    {typeChipLabel(event.type)}
                  </span>
                  {event.guestCount > 0 && (
                    <div className="mt-1 text-[11px] text-ink-secondary">
                      {event.guestCount} invited
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
