import type { EventItem } from "@/modules/events/format";

// The shape GET /api/dashboard returns, shared by the service and the dashboard page.
// No server-only imports: the browser uses this file.

export type DashboardTask = { id: string; title: string; dueDate: string; overdue: boolean };

export type UpcomingEvent = Pick<
  EventItem,
  "id" | "name" | "type" | "date" | "time" | "venueName" | "guestCount"
>;

export type Dashboard = {
  wedding: { brideName: string; groomName: string; weddingDate: string; daysToGo: number };
  /** `guestCount` is the number invited (0 until the Guests module exists). */
  upcomingEvents: UpcomingEvent[];
  // TODO(Phase 3, 4): RSVP counts (invited from guests, replies from rsvps). `null` until then.
  rsvp: null;
  // TODO(Phase 5): `{ totalSpentPaise }` from the expense log. `null` until then.
  money: null;
  tasks: {
    total: number;
    done: number;
    pending: number;
    overdue: number;
    /** The logged-in member's own tasks: how many they have ever had, and their next few open ones. */
    mine: { total: number; pending: number; overdue: number; next: DashboardTask[] };
  };
  /** What the setup checklist ticks off. */
  setup: { events: boolean; tasks: boolean; guests: boolean; team: boolean };
  /** Admins only: who has been invited and has not joined yet. */
  pendingInviteNames?: string[];
};
