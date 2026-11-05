"use client";

import { Button } from "@/components/Button";
import { EventAvailableIcon, PlusBoldIcon } from "@/components/icons";
import { DEFAULT_EVENT_TYPES } from "@/modules/events/schema";

type Props = {
  onAdd: (type?: string) => void;
};

/** Shown before the first event: a prompt, plus a chip for each default event type. */
export function EmptyState({ onAdd }: Props) {
  return (
    <div className="mx-auto my-4 flex w-full max-w-[620px] flex-col items-center rounded-card border border-border bg-surface p-6 text-center shadow-card sm:p-10">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-border bg-lilac text-plum">
        <EventAvailableIcon className="text-3xl" />
      </div>
      <h2 className="mb-2 font-display text-2xl text-plum">
        No events <em className="text-champagne-deep">yet</em>
      </h2>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-ink-body">
        Add your first event, like the Haldi or the Muhurtham. Each one gets its own guest list,
        timings, and map directions.
      </p>
      <Button size="lg" className="mb-8" onClick={() => onAdd()}>
        <PlusBoldIcon className="size-4" />
        Add first event
      </Button>
      <div className="flex w-full flex-col items-center gap-3 border-t border-border pt-6">
        <span className="text-[11px] font-semibold tracking-wider text-ink-secondary uppercase">
          Or start with an event type:
        </span>
        <div className="flex max-w-lg flex-wrap items-center justify-center gap-2">
          {DEFAULT_EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              className="flex min-h-11 items-center rounded-full border border-border bg-ivory px-3.5 py-1.5 text-xs text-plum transition-colors hover:bg-lilac sm:min-h-9"
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
