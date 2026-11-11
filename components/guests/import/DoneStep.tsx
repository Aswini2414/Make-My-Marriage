"use client";

import { Button, ButtonLink } from "@/components/Button";
import { CheckIcon } from "@/components/icons";

type Props = {
  created: number;
  /** Which rows were skipped and why, or undefined when none were. */
  skipped?: string;
  onAnother: () => void;
};

/** Step 3: how many guests were imported. */
export function DoneStep({ created, skipped, onAnother }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-card border border-border bg-ivory p-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-lilac text-plum">
        <CheckIcon className="size-8" />
      </div>
      <p role="status" className="font-display text-3xl text-plum">
        {created} {created === 1 ? "guest" : "guests"} imported
      </p>
      {skipped && <p className="mt-2 text-sm leading-relaxed text-ink-body">{skipped}</p>}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/guests" size="lg">
          View guests
        </ButtonLink>
        <Button variant="secondary" size="lg" onClick={onAnother}>
          Import another file
        </Button>
      </div>
    </div>
  );
}
