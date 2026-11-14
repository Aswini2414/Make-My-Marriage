import { NearMeIcon } from "@/components/icons";
import { formatDateWithDay, formatTime12 } from "@/lib/dates";
import { type InvitationEvent, mapHref } from "@/modules/rsvp/page-state";

/** One event the guest is invited to: the name, when, where, the dress code and a map link. */
export function EventCard({ event }: { event: InvitationEvent }) {
  const map = mapHref(event.mapLink);
  return (
    <article className="space-y-2.5 rounded-card border border-border bg-surface p-4 shadow-card sm:space-y-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-xl break-words text-ink sm:text-2xl">{event.name}</h3>
          <p className="mt-0.5 text-xs font-medium text-ink-secondary">
            {formatDateWithDay(event.date)} · {formatTime12(event.time)}
          </p>
        </div>
        <span className="max-w-[40%] shrink-0 truncate rounded-full bg-lilac px-2.5 py-0.5 text-[11px] font-medium text-plum sm:px-3 sm:py-1 sm:text-xs">
          {event.type}
        </span>
      </div>
      <div className="space-y-0.5 border-t border-border/60 pt-2 text-xs text-ink-body sm:space-y-1 sm:pt-2.5">
        <p className="font-medium break-words text-ink">{event.venueName}</p>
        {event.address && <p className="break-words text-ink-secondary">{event.address}</p>}
        {event.dressCode && (
          <p className="pt-1 text-[11px] break-words text-ink-secondary sm:pt-0 sm:text-xs">
            <span className="font-medium text-ink-body">Dress code:</span> {event.dressCode}
          </p>
        )}
      </div>
      {map && (
        <div className="-mt-2.5 -mb-3.5 sm:-mt-3">
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-plum hover:underline"
          >
            <NearMeIcon className="text-[15px] sm:text-sm" />
            Open in Maps
          </a>
        </div>
      )}
    </article>
  );
}
