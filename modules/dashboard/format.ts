import { formatDayMonth, formatShortDate } from "@/lib/dates";
import { percent } from "@/modules/tasks/format";
import type { Dashboard, DashboardTask } from "./types";

// Pure helpers for the dashboard page. No server-only imports.

export type SetupItem = {
  key: keyof Dashboard["setup"];
  href: string;
  title: string;
  text: string;
  action: string;
  done: boolean;
  /** False while the page it leads to does not exist yet, so it cannot hold the checklist open. */
  built: boolean;
};

/** The setup checklist, ticked from real data. Modules not built yet stay unticked. */
export function setupItems(setup: Dashboard["setup"]): SetupItem[] {
  return [
    {
      key: "events",
      href: "/events",
      title: "Add your events",
      text: "Haldi, mehendi, sangeet, wedding and reception.",
      action: "Add events",
      done: setup.events,
      built: true,
    },
    {
      key: "tasks",
      href: "/tasks",
      title: "Add your first task",
      text: "Book the caterer, order the cards, and give each one an owner and a date.",
      action: "Add tasks",
      done: setup.tasks,
      built: true,
    },
    {
      key: "guests",
      href: "/guests",
      title: "Add your guests",
      text: "Type them in or import a CSV or Excel file.",
      action: "Add guests",
      done: setup.guests,
      // Stays false until 3B: the setup item links to /guests, which is still a placeholder page,
      // so showing it would leave the checklist stuck open. Flip to true with the Guests page.
      built: false,
    },
    {
      key: "team",
      href: "/members",
      title: "Invite your family",
      text: "Bring in parents and siblings as Admins or Managers.",
      action: "Invite",
      done: setup.team,
      built: true,
    },
  ];
}

/** The checklist goes away once every item that can be done yet is done. */
export function showChecklist(items: SetupItem[]): boolean {
  return items.some((i) => i.built && !i.done);
}

/** Width of the progress bar, 0 to 100. */
export function taskProgress(tasks: Pick<Dashboard["tasks"], "done" | "total">): number {
  return percent(tasks.done, tasks.total);
}

/**
 * Under a task in "My tasks": "Overdue · 20 Oct" or "Due 28 Oct". The year is added only when
 * it is not this year, so "Due 5 Jan 2028" is not mistaken for the coming January.
 */
export function dueText(task: Pick<DashboardTask, "dueDate" | "overdue">, today: string): string {
  const date =
    task.dueDate.slice(0, 4) === today.slice(0, 4)
      ? formatDayMonth(task.dueDate)
      : formatShortDate(task.dueDate);
  return task.overdue ? `Overdue · ${date}` : `Due ${date}`;
}

/** "2 invites waiting to be accepted: Anil and Sita". */
export function invitesText(names: string[]): string {
  const list =
    names.length <= 1
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.length} ${names.length === 1 ? "invite" : "invites"} waiting to be accepted: ${list}`;
}
