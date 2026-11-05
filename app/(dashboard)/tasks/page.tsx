import type { Metadata } from "next";
import { TasksView } from "@/components/tasks/TasksView";
import { todayIST } from "@/lib/dates";
import { pageMember } from "@/lib/page-access";
import { listEvents } from "@/modules/events/service";
import { listMembers } from "@/modules/members/service";
import { listTasks } from "@/modules/tasks/service";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const { user, member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const { wedding, role } = member!;
  const [{ items: tasks }, { items: members }, events] = await Promise.all([
    // Everything, unfiltered: the page filters in the browser and keeps the address bar in sync.
    listTasks(wedding.id, { userId: user.id, role }, {}),
    listMembers(wedding.id, false),
    listEvents(wedding.id),
  ]);
  return (
    <TasksView
      tasks={tasks}
      members={members.map((m) => ({ userId: m.userId, name: m.name, role: m.role }))}
      events={events.map((e) => ({ id: e.id, name: e.name, date: e.date }))}
      me={{ userId: user.id, role, name: user.name }}
      today={todayIST()}
    />
  );
}
