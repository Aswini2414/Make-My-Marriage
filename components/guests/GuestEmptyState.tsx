"use client";

import { Button, ButtonLink } from "@/components/Button";
import { PersonAddOutlineIcon, PlusBoldIcon, UploadIcon } from "@/components/icons";

/** Shown when the wedding has no guests at all. */
export function GuestEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto my-4 flex w-full max-w-[620px] flex-col items-center rounded-card border border-border bg-surface p-6 text-center shadow-card sm:p-10">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-border bg-lilac text-plum">
        <PersonAddOutlineIcon className="size-8" />
      </div>
      <h2 className="mb-2 font-display text-2xl text-plum">
        No guests <em className="text-champagne-deep">yet</em>
      </h2>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-ink-body">
        Add guests one at a time, or import your whole list from a spreadsheet.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" data-focus-return="add" onClick={onAdd}>
          <PlusBoldIcon className="size-4" />
          Add guest
        </Button>
        <ButtonLink
          href="/guests/import"
          variant="secondary"
          size="lg"
          className="border-champagne"
        >
          <UploadIcon className="text-base" />
          Import from CSV or Excel
        </ButtonLink>
      </div>
    </div>
  );
}

/** Shown when filters leave nothing. Not the first-time empty state: guests exist. */
export function NoMatchingGuests({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <h2 className="font-display text-2xl text-plum">No guests match these filters</h2>
      <p className="text-sm text-ink-body">Try a different search, or remove a filter.</p>
      <button
        type="button"
        onClick={onClear}
        className="flex min-h-11 items-center text-sm font-medium text-plum underline underline-offset-2"
      >
        Clear filters
      </button>
    </div>
  );
}
