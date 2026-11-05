import { formatShortDate } from "@/lib/dates";
import { type TaskStatus, taskOverdue } from "./overdue";
import type { TaskCounts, TaskItem } from "./types";

// Pure helpers for the Tasks page. No server-only imports: the browser uses this file.
// The filters and counts here must give the same answers as the API's (tests/modules/
// tasks-ui.test.ts compares them against the real service). One known gap: the title search
// lowercases in the browser and uses a case-insensitive regex in MongoDB, so they agree for
// ordinary text but can differ for a few special-case letters in other scripts.

export const TASK_TABS = ["all", "mine", "overdue"] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export type TaskFilters = {
  view: TaskTab;
  status?: TaskStatus;
  eventId?: string;
  q: string;
};

export const NO_FILTERS: TaskFilters = { view: "all", q: "" };

export type Me = { userId: string; role: "admin" | "manager" };

/** "18 Oct 2026". */
export const formatTaskDate = formatShortDate;

/** Under a task on the Overdue tab: "Due yesterday" or "6 days overdue". */
export function overdueLabel(daysOverdue: number): string {
  return daysOverdue <= 1 ? "Due yesterday" : `${daysOverdue} days overdue`;
}

/** Whole-number percentage of `part` in `total`, 0 when there is nothing. */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** The small lines under the four stat cards. */
export function statNotes(summary: TaskCounts) {
  return {
    total: "Across all events",
    todo: summary.total === 0 ? "All clear" : `${percent(summary.todo, summary.total)}% remaining`,
    done: `${percent(summary.done, summary.total)}% completed`,
    overdue: summary.overdue === 0 ? "None overdue" : "Requires attention",
  };
}

/** Only the assignee or an Admin can mark a task done or reopen it. */
export function canChangeStatus(task: Pick<TaskItem, "assignee">, me: Me): boolean {
  return me.role === "admin" || task.assignee.id === me.userId;
}

/** The task as it will look after a status change, for the optimistic update. */
export function withStatus(task: TaskItem, status: TaskStatus, today: string): TaskItem {
  const next: TaskItem = {
    ...task,
    status,
    ...taskOverdue({ status, dueDate: task.dueDate }, today),
  };
  delete next.completedAt;
  delete next.completedBy;
  if (status === "done") next.completedAt = new Date().toISOString();
  return next;
}

/** The task with its overdue flag worked out for `today`. The same object when nothing changes. */
export function withToday(task: TaskItem, today: string): TaskItem {
  const { overdue, daysOverdue } = taskOverdue(task, today);
  return overdue === task.overdue && daysOverdue === task.daysOverdue
    ? task
    : { ...task, overdue, daysOverdue };
}

/** The API's order: open tasks first, then by due date, then by id. */
export function sortTasks(items: TaskItem[]): TaskItem[] {
  return [...items].sort(
    (a, b) =>
      // Reversed on purpose: "todo" sorts after "done" as text, and open tasks come first.
      b.status.localeCompare(a.status) ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.id.localeCompare(b.id),
  );
}

function counts(items: TaskItem[]): TaskCounts {
  const done = items.filter((t) => t.status === "done").length;
  return {
    total: items.length,
    todo: items.length - done,
    done,
    overdue: items.filter((t) => t.overdue).length,
  };
}

/** The four stat-card numbers, for the whole list and for one member. */
export function summarize(items: TaskItem[], meId: string) {
  return { summary: counts(items), mine: counts(items.filter((t) => t.assignee.id === meId)) };
}

/** The same filters as `GET /api/tasks`, applied in the browser. */
export function filterTasks(items: TaskItem[], filters: TaskFilters, meId: string): TaskItem[] {
  const q = filters.q.trim().toLowerCase();
  return items.filter(
    (t) =>
      (filters.view !== "mine" || t.assignee.id === meId) &&
      (filters.view !== "overdue" || t.overdue) &&
      (!filters.status || t.status === filters.status) &&
      (!filters.eventId || t.eventId === filters.eventId) &&
      (!q || t.title.toLowerCase().includes(q)),
  );
}

/** Whether anything narrows the list beyond "All tasks". */
export function hasActiveFilters(filters: TaskFilters): boolean {
  return filters.view !== "all" || !!filters.status || !!filters.eventId || !!filters.q.trim();
}

type Params = { get(name: string): string | null };

/** The page's filters from the address bar. Unknown values are ignored. */
export function parseFilters(params: Params): TaskFilters {
  const view = params.get("view");
  const status = params.get("status");
  return {
    view: (TASK_TABS as readonly string[]).includes(view ?? "") ? (view as TaskTab) : "all",
    ...(status === "todo" || status === "done" ? { status } : {}),
    ...(params.get("event") ? { eventId: params.get("event")! } : {}),
    q: params.get("q") ?? "",
  };
}

/** The address-bar form of the filters; defaults are left out. */
export function filtersToQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.status) params.set("status", filters.status);
  if (filters.eventId) params.set("event", filters.eventId);
  if (filters.q.trim()) params.set("q", filters.q);
  return params.toString();
}
