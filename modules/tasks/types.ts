import type { TaskStatus } from "./overdue";

// The shapes the Tasks API returns, shared by the service and the Tasks page so they cannot
// drift apart. No server-only imports: the browser uses this file.

export type TaskPerson = { id: string; name: string };

export type TaskItem = {
  id: string;
  title: string;
  assignee: TaskPerson & {
    /** First letter of the name, for the small circle. */
    initial: string;
    /** True when the assignee is no longer an active member. Their name stays. */
    removed: boolean;
  };
  dueDate: string;
  eventId?: string;
  /** The linked event's name, when there is one. */
  eventName?: string;
  status: TaskStatus;
  overdue: boolean;
  daysOverdue: number;
  note?: string;
  completedAt?: string;
  completedBy?: TaskPerson;
  createdBy?: TaskPerson;
};

export type TaskCounts = { total: number; todo: number; done: number; overdue: number };

export type TaskList = {
  items: TaskItem[];
  /** Counts for the whole wedding, whatever filters the list used. */
  summary: TaskCounts;
  /** The same counts for the logged-in member's own tasks. */
  mine: TaskCounts;
};
