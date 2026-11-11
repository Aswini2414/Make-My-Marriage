"use client";

import { CheckroomIcon, GroupIcon, LocationOnIcon, ScheduleIcon } from "@/components/icons";
import { RowMenu } from "@/components/ui/RowMenu";
import { dateTileParts, formatTime12 } from "@/lib/dates";
import { type EventItem, typeChipLabel } from "@/modules/events/format";

type Props = {
  event: EventItem;
  onEdit: () => void;
  onDelete: () => void;
};

export function EventCard({ event, onEdit, onDelete }: Props) {
  const tile = dateTileParts(event.date);
  return (
    <article
      data-event-id={event.id}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-mauve sm:p-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6"
    >
      <div className="flex min-w-0 items-start gap-4 sm:gap-5">
        <div className="flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-ivory p-1 text-center">
          <span className="font-display text-2xl leading-none text-plum">{tile.day}</span>
          <span className="mt-1 text-[10px] font-semibold tracking-widest text-champagne-deep uppercase">
            {tile.month}
          </span>
          <span className="text-[9px] text-ink-secondary uppercase">{tile.weekday}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h3 className="min-w-0 font-display text-2xl leading-tight text-plum">{event.name}</h3>
            <span className="rounded-full bg-lilac px-2.5 py-0.5 text-[10px] font-medium tracking-wider text-plum uppercase">
              {typeChipLabel(event.type)}
            </span>
            {event.youtubeLink && (
              <span className="flex items-center gap-1 rounded-full bg-lilac px-2.5 py-0.5 text-[9px] font-medium tracking-wider text-plum uppercase">
                <span className="size-1.5 rounded-full bg-champagne-deep" />
                Live link added
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm break-words text-ink-body sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2">
              <ScheduleIcon className="shrink-0 text-base text-ink-secondary" />
              <span>{formatTime12(event.time)}</span>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <LocationOnIcon className="mt-0.5 shrink-0 text-base text-ink-secondary" />
              <span className="min-w-0">
                {event.venueName}
                {event.mapLink && (
                  <a
                    href={event.mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative ml-2 text-xs font-medium text-champagne-deep underline decoration-champagne/60 before:absolute before:-inset-x-2 before:-inset-y-4 before:content-[''] hover:text-plum"
                  >
                    Map
                  </a>
                )}
              </span>
            </div>
            {event.dressCode && (
              <div className="flex min-w-0 items-start gap-2 sm:col-span-2">
                <CheckroomIcon className="mt-0.5 shrink-0 text-base text-ink-secondary" />
                <span className="min-w-0">Dress code: {event.dressCode}</span>
              </div>
            )}
            {event.address && (
              <p className="pl-6 text-xs text-ink-secondary sm:col-span-2">{event.address}</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 lg:flex-col lg:items-end lg:self-stretch">
        <span className="flex items-center gap-1.5 rounded-full bg-lilac px-3 py-1 text-xs font-medium text-plum">
          <GroupIcon className="text-sm text-champagne-deep" />
          {event.guestCount} invited
        </span>
        <div className="flex items-center gap-1 lg:mt-auto">
          <button
            type="button"
            data-focus-return={event.id}
            onClick={onEdit}
            aria-label={`Edit ${event.name}`}
            className="flex h-11 items-center rounded-full px-4 text-xs font-medium text-plum transition-colors hover:bg-lilac lg:h-9"
          >
            Edit
          </button>
          <RowMenu name={event.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </article>
  );
}
