import "server-only";
import { connectDb } from "@/lib/db";
import { daysBetween, todayIST } from "@/lib/dates";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Event } from "@/modules/events/model";
import { listUpcomingEvents } from "@/modules/events/service";
import { hasGuests } from "@/modules/guests/service";
import { MemberInvite, Membership } from "@/modules/members/model";
import { type Actor, listTasks } from "@/modules/tasks/service";
import { Wedding } from "@/modules/weddings/model";
import type { Dashboard } from "./types";

// Everything the dashboard shows, filtered by the caller's weddingId.

const UPCOMING_EVENTS = 5;
const NEXT_TASKS = 3;

export async function getDashboard(weddingId: string, actor: Actor): Promise<Dashboard> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const today = todayIST();
  const isAdmin = actor.role === "admin";

  const [wedding, upcoming, tasks, eventCount, hasGuest, members, invites] = await Promise.all([
    Wedding.findById(wid).select("brideName groomName weddingDate").lean(),
    listUpcomingEvents(weddingId, today, UPCOMING_EVENTS),
    // The task service does the counting and the overdue rule; this view is "my open tasks",
    // which come back in due-date order, overdue first. Only the first few are loaded, and its
    // counts ignore both the filters and the limit.
    listTasks(weddingId, actor, { view: "mine", status: "todo" }, NEXT_TASKS),
    Event.countDocuments({ weddingId: wid }),
    hasGuests(weddingId),
    Membership.countDocuments({ weddingId: wid, status: "active" }),
    // Only Admins see invites. The TTL index removes expired ones a little late, so filter here.
    isAdmin
      ? MemberInvite.find({ weddingId: wid, acceptedAt: null, expiresAt: { $gt: new Date() } })
          .sort({ createdAt: 1 })
          .select("name")
          .lean()
      : [],
  ]);
  if (!wedding) throw new ApiError("NOT_FOUND");

  const { summary, mine } = tasks;
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      weddingDate: wedding.weddingDate,
      daysToGo: daysBetween(today, wedding.weddingDate),
    },
    upcomingEvents: upcoming.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      date: e.date,
      time: e.time,
      venueName: e.venueName,
      guestCount: e.guestCount,
    })),
    // TODO(Phase 3, 4): RSVP counts. Invited comes from guests, replies from rsvps.
    rsvp: null,
    // TODO(Phase 5): `{ totalSpentPaise }` from the expense log.
    money: null,
    tasks: {
      total: summary.total,
      done: summary.done,
      pending: summary.todo,
      overdue: summary.overdue,
      mine: {
        total: mine.total,
        pending: mine.todo,
        overdue: mine.overdue,
        next: tasks.items.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          overdue: t.overdue,
        })),
      },
    },
    setup: {
      events: eventCount > 0,
      tasks: summary.total > 0,
      guests: hasGuest,
      // Someone else has joined. A pending invite does not count: it can expire.
      team: members > 1,
    },
    ...(isAdmin ? { pendingInviteNames: invites.map((i) => i.name) } : {}),
  };
}
