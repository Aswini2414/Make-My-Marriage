export type ImportStep = "upload" | "review" | "done";

const STEPS: { id: ImportStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

/** "1 Upload — 2 Review — 3 Done", with the current step marked for screen readers. */
export function Stepper({ step }: { step: ImportStep }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <ol aria-label="Import steps" className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
      {STEPS.map((s, i) => {
        const current = i === at;
        return (
          <li key={s.id} className="flex items-center gap-2 sm:gap-3">
            <span
              aria-current={current ? "step" : undefined}
              className={`rounded-full px-3 py-1 whitespace-nowrap ${
                current
                  ? "bg-plum font-medium text-ivory"
                  : i < at
                    ? "text-plum"
                    : "text-ink-secondary"
              }`}
            >
              {i + 1} {s.label}
              {i < at && <span className="sr-only"> (done)</span>}
            </span>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="h-px w-3 bg-border sm:w-5" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
