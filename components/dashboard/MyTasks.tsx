import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { PlusBoldIcon } from "@/components/icons";
import { dueText } from "@/modules/dashboard/format";
import type { Dashboard } from "@/modules/dashboard/types";

/** The logged-in member's own open tasks. */
export function MyTasks({ tasks, today }: { tasks: Dashboard["tasks"]; today: string }) {
  const { mine } = tasks;

  return (
    <section className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6 lg:col-span-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <h2 className="font-display text-[22px] text-ink">My tasks</h2>
        {tasks.total > 0 && (
          <Link
            href={mine.total > 0 ? "/tasks?view=mine" : "/tasks"}
            className="tap-area text-xs font-medium text-plum hover:underline"
          >
            View all tasks
          </Link>
        )}
      </div>

      {tasks.total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-sm font-medium text-ink">No tasks yet</p>
          <p className="max-w-xs text-xs leading-relaxed text-ink-secondary">
            Add a task and give it an owner and a date.
          </p>
          <ButtonLink href="/tasks" className="mt-1 h-11 gap-2 px-5 text-xs">
            <PlusBoldIcon strokeWidth={2} className="size-3.5" />
            Add task
          </ButtonLink>
        </div>
      ) : mine.next.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-sm font-medium text-ink">
            {mine.total === 0 ? "Nothing is assigned to you" : "Nothing is waiting on you"}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-ink-secondary">
            {mine.total === 0
              ? "No task has been given to you yet. Everyone else’s tasks are on the Tasks page."
              : "You have no open tasks. Everything assigned to you is done."}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-1 flex-1 divide-y divide-border/60">
            {mine.next.map((task) => (
              <li key={task.id}>
                <Link href="/tasks?view=mine" className="flex min-h-11 items-start gap-3 py-3.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 rounded-full border border-ink-secondary/70"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs leading-snug font-medium break-words text-ink">
                      {task.title}
                    </span>
                    <span
                      className={`mt-1 block text-[11px] ${
                        task.overdue ? "font-medium text-error" : "text-ink-secondary"
                      }`}
                    >
                      {dueText(task, today)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-[11px] text-ink-secondary">
            <span>
              {mine.pending} of your {mine.pending === 1 ? "task is" : "tasks are"} open
            </span>
            {mine.overdue > 0 && (
              <span className="font-medium text-error">{mine.overdue} overdue</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
