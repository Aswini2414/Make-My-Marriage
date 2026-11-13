import Link from "next/link";
import { formatDateWithDay } from "@/lib/dates";
import { taskProgress } from "@/modules/dashboard/format";
import type { Dashboard } from "@/modules/dashboard/types";

const cardLabel = "text-[10px] font-semibold tracking-widest uppercase";
const card =
  "flex flex-col justify-between rounded-card border border-border bg-surface p-5 shadow-2xs";

function countdown(days: number) {
  const n = Math.abs(days);
  if (days === 0) return { number: "0", label: "It’s today!" };
  const unit = n === 1 ? "day" : "days";
  return { number: String(n), label: days > 0 ? `${unit} to go` : `${unit} ago` };
}

/** A card for a module that has no numbers yet: a dash, one honest line, and where to start. */
function NotStartedCard({
  label,
  note,
  href,
  action,
}: {
  label: string;
  note: string;
  href: string;
  action?: string;
}) {
  return (
    <div className={card}>
      <div>
        <div className="flex items-center justify-between">
          <span className={`${cardLabel} text-ink-secondary`}>{label}</span>
          {action && (
            <Link
              href={href}
              className="tap-area text-[11px] font-medium text-plum hover:underline"
            >
              {action}
            </Link>
          )}
        </div>
        <div className="mt-2">
          <span className="font-display text-3xl leading-none text-ink-secondary/60 lg:text-[38px]">
            —
          </span>
        </div>
      </div>
      <div className="mt-6 border-t border-border/40 pt-3 text-[11px] text-ink-secondary">
        <Link href={href} className="tap-area hover:text-plum hover:underline">
          {note}
        </Link>
      </div>
    </div>
  );
}

/** The top row: countdown, RSVP, total spent and task progress. */
export function StatCards({ data }: { data: Dashboard }) {
  const { wedding, tasks } = data;
  const { number, label } = countdown(wedding.daysToGo);
  const progress = taskProgress(tasks);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col justify-between rounded-card border border-plum bg-plum p-5 text-surface shadow-2xs">
        <div>
          <span className={`${cardLabel} text-champagne`}>Countdown</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-4xl leading-none tracking-tight lg:text-[42px]">
              {number}
            </span>
            <span className="text-xs text-surface/80">{label}</span>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-surface/70">{formatDateWithDay(wedding.weddingDate)}</p>
      </div>

      {/* TODO(Phase 4C): show the counts here. `data.rsvp` is real now (`overall` and `byEvent`). */}
      <NotStartedCard label="RSVP" note="Send invitations to see replies here" href="/guests" />

      {/* TODO(Phase 5): show the total here once `data.money` is not null. */}
      <NotStartedCard
        label="Total spent"
        note="Record your first expense to see the total"
        href="/money"
        action="Open Money"
      />

      {tasks.total === 0 ? (
        <NotStartedCard label="Tasks" note="No tasks yet" href="/tasks" action="Add task" />
      ) : (
        <div className={card}>
          <div>
            <span className={`${cardLabel} text-ink-secondary`}>Tasks</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl leading-none text-ink lg:text-[38px]">
                {tasks.done} of {tasks.total}
              </span>
              <span className="text-xs text-ink-secondary">done</span>
            </div>
            <div
              role="progressbar"
              aria-label="Tasks done"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-mist"
            >
              <div className="h-full rounded-full bg-plum" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-[11px]">
            <span className="text-ink-secondary">{tasks.pending} pending</span>
            {tasks.overdue > 0 ? (
              <Link
                href="/tasks?view=overdue"
                className="tap-area font-medium text-error hover:underline"
              >
                {tasks.overdue} overdue
              </Link>
            ) : (
              <span className="text-ink-secondary">None overdue</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
