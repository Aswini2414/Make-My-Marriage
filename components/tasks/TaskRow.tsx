"use client";

import { CheckIcon, EditIcon } from "@/components/icons";
import {
  canChangeStatus,
  formatTaskDate,
  type Me,
  overdueLabel,
  type TaskTab,
} from "@/modules/tasks/format";
import type { TaskItem } from "@/modules/tasks/types";

type Props = {
  task: TaskItem;
  me: Me;
  tab: TaskTab;
  /** A status change for this task is on its way to the server. */
  pending: boolean;
  onToggle: (task: TaskItem) => void;
  onEdit: (task: TaskItem) => void;
};

const NOT_ALLOWED = "Only the assignee or an Admin can mark this done";

/**
 * One task: check circle, title, event, owner, due date, status and the edit pencil.
 * On a phone it is two lines (title and pencil, then the details); from 1024px it is one row.
 */
export function TaskRow({ task, me, tab, pending, onToggle, onEdit }: Props) {
  const done = task.status === "done";
  const allowed = canChangeStatus(task, me);
  const action = done ? `Reopen "${task.title}"` : `Mark "${task.title}" as done`;

  return (
    <li
      data-task-id={task.id}
      className={`grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-3 p-4 transition-colors sm:px-6 lg:flex lg:items-center lg:gap-4 lg:py-5 ${
        done ? "bg-ivory/70" : "hover:bg-ivory/60"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3.5 lg:flex-1 lg:items-center">
        {/* The round check. Its tap area is 44px; the circle itself is 20px. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          // Not `disabled`, so keyboard and screen-reader users can still reach the reason.
          aria-disabled={!allowed || pending}
          aria-label={allowed ? action : `${action}. ${NOT_ALLOWED}.`}
          title={allowed ? undefined : NOT_ALLOWED}
          onClick={() => allowed && !pending && onToggle(task)}
          className="-m-3 flex size-11 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-5 items-center justify-center rounded-full border transition-colors ${
              done
                ? "border-plum bg-plum text-ivory"
                : "border-mauve text-transparent hover:border-plum hover:text-mauve"
            } ${!allowed ? "opacity-50" : ""}`}
          >
            <CheckIcon className="text-[13px]" />
          </span>
        </button>
        <div className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
          <span
            className={`text-sm break-words ${done ? "text-ink-subtle line-through" : "text-ink"}`}
          >
            {task.title}
          </span>
          <span
            className={`w-fit rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
              done ? "bg-lilac/60 text-ink-subtle" : "bg-lilac text-plum"
            }`}
          >
            {task.eventName ?? "All events"}
          </span>
        </div>
      </div>

      <button
        type="button"
        data-focus-return={task.id}
        onClick={() => onEdit(task)}
        aria-label={`Edit "${task.title}"`}
        title="Edit task"
        className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-full text-ink-secondary transition-colors hover:text-plum lg:order-3 lg:-my-1 lg:mr-0 lg:ml-0 lg:size-7"
      >
        <EditIcon className="text-lg" />
      </button>

      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-[34px] lg:order-2 lg:col-span-1 lg:shrink-0 lg:gap-x-6 lg:pl-0">
        <div
          className={`flex items-center gap-1.5 ${done ? "opacity-70" : ""}`}
          title={task.assignee.removed ? `${task.assignee.name} (removed)` : task.assignee.name}
        >
          <span
            aria-hidden="true"
            className={`flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${
              task.assignee.removed
                ? "border border-dashed border-mauve text-ink-secondary"
                : "bg-lilac text-plum"
            }`}
          >
            {task.assignee.initial}
          </span>
          <span className={`text-xs ${done ? "text-ink-subtle" : "text-ink-secondary"}`}>
            {task.assignee.name}
            {task.assignee.removed && " (removed)"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs ${
              task.overdue
                ? "font-medium text-error"
                : done
                  ? "text-ink-subtle line-through"
                  : "text-ink-secondary"
            }`}
          >
            {formatTaskDate(task.dueDate)}
          </span>
          {task.overdue &&
            (tab === "overdue" ? (
              <span className="text-xs font-medium text-error">
                {overdueLabel(task.daysOverdue)}
              </span>
            ) : (
              <span className="rounded border border-error-border bg-error-bg px-2 py-0.5 text-[9px] font-medium tracking-wide text-error uppercase">
                Overdue
              </span>
            ))}
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            done ? "bg-lilac/60 text-ink-body" : "bg-lilac text-ink-body"
          }`}
        >
          {done ? "Done" : "To do"}
        </span>
      </div>
    </li>
  );
}
