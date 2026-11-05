import { statNotes } from "@/modules/tasks/format";
import type { TaskCounts } from "@/modules/tasks/types";

const label = "block text-[11px] font-semibold tracking-wider uppercase";
const number = "mt-2 block font-display text-3xl leading-none";
const card = "rounded-card border border-border bg-surface p-4 shadow-card sm:p-6";

/** The four numbers above the list. They always count the whole wedding, never the filters. */
export function TaskStats({ summary }: { summary: TaskCounts }) {
  const notes = statNotes(summary);
  const overdue = summary.overdue > 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <div className={card}>
        <span className={`${label} text-ink-secondary`}>Total tasks</span>
        <span className={`${number} text-plum`}>{summary.total}</span>
        <span className="mt-2 block text-[11px] text-ink-secondary">{notes.total}</span>
      </div>
      <div className={card}>
        <span className={`${label} text-ink-secondary`}>To do</span>
        <span className={`${number} text-plum`}>{summary.todo}</span>
        <span className="mt-2 block text-[11px] text-champagne-deep">{notes.todo}</span>
      </div>
      <div className={card}>
        <span className={`${label} text-ink-secondary`}>Done</span>
        <span className={`${number} text-plum`}>{summary.done}</span>
        <span className="mt-2 block text-[11px] text-ink-secondary">{notes.done}</span>
      </div>
      <div className={card}>
        <span className={`${label} ${overdue ? "text-error" : "text-ink-secondary"}`}>Overdue</span>
        <span className={`${number} ${overdue ? "text-error" : "text-plum"}`}>
          {summary.overdue}
        </span>
        <span
          className={`mt-2 block text-[11px] ${overdue ? "text-error/80" : "text-ink-secondary"}`}
        >
          {notes.overdue}
        </span>
      </div>
    </div>
  );
}
