"use client";

import { Button } from "@/components/Button";
import { ChecklistIcon, PlusBoldIcon } from "@/components/icons";

export const TASK_TEMPLATES = [
  "Book caterer",
  "Finalise muhurtham timings",
  "Order sweets & dry fruits",
  "Hire photographer",
] as const;

/** Before the first task: a prompt and four ready-made starting points. */
export function FirstTaskPrompt({ onAdd }: { onAdd: (title?: string) => void }) {
  return (
    <div className="mx-auto my-4 flex w-full max-w-[620px] flex-col items-center rounded-card border border-border bg-surface p-6 text-center shadow-card sm:p-10">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-border bg-lilac text-plum">
        <ChecklistIcon className="text-3xl" />
      </div>
      <h2 className="mb-2 font-display text-2xl text-plum">
        No tasks <em className="text-champagne-deep">yet</em>
      </h2>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-ink-body">
        Add things like booking the caterer or ordering cards, and give each one an owner and a
        date.
      </p>
      <Button size="lg" className="mb-8" onClick={() => onAdd()}>
        <PlusBoldIcon className="size-4" />
        Add task
      </Button>
      <div className="flex w-full flex-col items-center gap-3 border-t border-border pt-6">
        <span className="text-[11px] font-semibold tracking-wider text-ink-secondary uppercase">
          Quick templates for your wedding:
        </span>
        <div className="flex max-w-lg flex-wrap items-center justify-center gap-2">
          {TASK_TEMPLATES.map((title) => (
            <button
              key={title}
              type="button"
              onClick={() => onAdd(title)}
              className="flex min-h-11 items-center rounded-full border border-border bg-ivory px-3.5 py-1.5 text-xs text-plum transition-colors hover:bg-lilac sm:min-h-9"
            >
              + {title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tasks exist, but none match the filters. */
export function NoMatchingTasks({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-xl text-plum">No tasks match these filters</p>
      <button
        type="button"
        onClick={onClear}
        className="tap-area text-sm font-medium text-champagne-deep underline decoration-champagne/60 transition-colors hover:text-plum"
      >
        Clear filters
      </button>
    </div>
  );
}
