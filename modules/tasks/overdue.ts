import { daysBetween, todayIST } from "@/lib/dates";

// The one rule for "overdue", used by the API's flag and its filters, and by the Tasks page.
// No server-only imports: the browser uses this file.
//
// A task is overdue when it is still To do and its due date is before today. "Today" is today
// in India Standard Time (todayIST), because the weddings are in India. A task due today is
// not overdue yet; it becomes overdue at midnight IST.

export type TaskStatus = "todo" | "done";

export type Overdue = { overdue: boolean; daysOverdue: number };

export function taskOverdue(
  task: { status: TaskStatus; dueDate: string },
  today: string = todayIST(),
): Overdue {
  // YYYY-MM-DD strings sort in date order.
  const overdue = task.status === "todo" && task.dueDate < today;
  return { overdue, daysOverdue: overdue ? daysBetween(task.dueDate, today) : 0 };
}
