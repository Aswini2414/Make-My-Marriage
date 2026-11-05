import mongoose, { type Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as dashboardRoute } from "@/app/api/dashboard/route";
import { daysBetween, todayIST } from "@/lib/dates";
import { Event } from "@/modules/events/model";
import { MemberInvite } from "@/modules/members/model";
import { Task } from "@/modules/tasks/model";
import type { Dashboard } from "@/modules/dashboard/types";
import { createMember, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

/** A date some days from today in India Standard Time, as YYYY-MM-DD. */
function daysFromToday(n: number): string {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A wedding with an Admin, plus helpers to add Managers and data. */
async function setup() {
  const admin = await createMember("admin");
  const adminId = String(admin.user._id);
  const weddingId = admin.weddingId;
  const addManager = async () =>
    String((await createMember("manager", undefined, weddingId)).user._id);
  const addEvent = (name: string, date: string, time = "10:00", wid: Types.ObjectId = weddingId) =>
    Event.create({ weddingId: wid, name, type: "Haldi", date, time, venueName: "Home" });
  const addTask = (
    title: string,
    assigneeId: string,
    dueDate: string,
    status: "todo" | "done" = "todo",
    wid: Types.ObjectId = weddingId,
  ) => Task.create({ weddingId: wid, title, assigneeId, dueDate, status, createdBy: adminId });
  return { weddingId, adminId, addManager, addEvent, addTask };
}

async function get(userId: string): Promise<Dashboard> {
  const res = await dashboardRoute(await request("/api/dashboard", { userId }), {} as never);
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/dashboard", () => {
  it("answers 401 without a session", async () => {
    const res = await dashboardRoute(await request("/api/dashboard"), {} as never);
    expect(res.status).toBe(401);
  });

  it("answers 403 for an account with no wedding", async () => {
    const { User } = await import("@/modules/auth/model");
    const { testPasswordHash } = await import("../helpers");
    const user = await User.create({
      name: "Lone",
      email: "lone@example.com",
      passwordHash: await testPasswordHash(),
    });
    const res = await dashboardRoute(
      await request("/api/dashboard", { userId: String(user._id) }),
      {} as never,
    );
    expect(res.status).toBe(403);
  });

  it("gives zeros, empty lists and null sections for a brand-new wedding", async () => {
    const { adminId } = await setup();
    const d = await get(adminId);
    expect(d.wedding).toEqual({
      brideName: "Priya",
      groomName: "Ravi",
      weddingDate: "2027-02-14",
      daysToGo: daysBetween(todayIST(), "2027-02-14"),
    });
    expect(d.upcomingEvents).toEqual([]);
    expect(d.rsvp).toBeNull();
    expect(d.money).toBeNull();
    expect(d.tasks).toEqual({
      total: 0,
      done: 0,
      pending: 0,
      overdue: 0,
      mine: { total: 0, pending: 0, overdue: 0, next: [] },
    });
    expect(d.setup).toEqual({ events: false, tasks: false, guests: false, team: false });
    expect(d.pendingInviteNames).toEqual([]);
    expect(d).not.toHaveProperty("pendingInvites");
  });
});

describe("upcoming events", () => {
  it("lists today and later, in date then time order, without past events", async () => {
    const { adminId, addEvent } = await setup();
    await addEvent("Past", daysFromToday(-1));
    await addEvent("Late today", daysFromToday(0), "19:00");
    await addEvent("Early today", daysFromToday(0), "08:30");
    await addEvent("Next week", daysFromToday(7));
    const d = await get(adminId);
    expect(d.upcomingEvents.map((e) => e.name)).toEqual(["Early today", "Late today", "Next week"]);
    expect(d.upcomingEvents[0]).toMatchObject({
      type: "Haldi",
      date: daysFromToday(0),
      time: "08:30",
      venueName: "Home",
      guestCount: 0,
    });
    expect(d.setup.events).toBe(true);
  });

  it("stops at five", async () => {
    const { adminId, addEvent } = await setup();
    for (let i = 1; i <= 7; i++) await addEvent(`Event ${i}`, daysFromToday(i));
    const d = await get(adminId);
    expect(d.upcomingEvents.map((e) => e.name)).toEqual([1, 2, 3, 4, 5].map((i) => `Event ${i}`));
  });

  it("never shows another wedding's events", async () => {
    const { adminId } = await setup();
    const other = await setup();
    await other.addEvent("Theirs", daysFromToday(2));
    const d = await get(adminId);
    expect(d.upcomingEvents).toEqual([]);
    expect(d.setup.events).toBe(false);
  });

  it("has only past events: nothing upcoming, but the checklist counts the event as added", async () => {
    const { adminId, addEvent } = await setup();
    await addEvent("Engagement", daysFromToday(-30));
    const d = await get(adminId);
    expect(d.upcomingEvents).toEqual([]);
    expect(d.setup.events).toBe(true);
  });
});

describe("task numbers", () => {
  it("counts the whole wedding and the caller's own tasks", async () => {
    const { adminId, addManager, addTask } = await setup();
    const managerId = await addManager();
    await addTask("A", adminId, daysFromToday(3));
    await addTask("B overdue", adminId, daysFromToday(-2));
    await addTask("C done", adminId, daysFromToday(-5), "done");
    await addTask("D", managerId, daysFromToday(1));
    await addTask("E overdue", managerId, daysFromToday(-1));

    const admin = await get(adminId);
    expect(admin.tasks).toMatchObject({ total: 5, done: 1, pending: 4, overdue: 2 });
    expect(admin.tasks.mine).toMatchObject({ pending: 2, overdue: 1 });
    expect(admin.setup.tasks).toBe(true);

    const manager = await get(managerId);
    expect(manager.tasks).toMatchObject({ total: 5, done: 1, pending: 4, overdue: 2 });
    expect(manager.tasks.mine).toMatchObject({ pending: 2, overdue: 1 });
  });

  it("does not count a task due today as overdue", async () => {
    const { adminId, addTask } = await setup();
    await addTask("Today", adminId, daysFromToday(0));
    const d = await get(adminId);
    expect(d.tasks.overdue).toBe(0);
    expect(d.tasks.mine.next[0]).toMatchObject({ title: "Today", overdue: false });
  });

  it("gives a Manager only their own next three open tasks, overdue first, never done ones", async () => {
    const { adminId, addManager, addTask } = await setup();
    const managerId = await addManager();
    await addTask("Admin's task", adminId, daysFromToday(-9));
    await addTask("Later", managerId, daysFromToday(20));
    await addTask("Soon", managerId, daysFromToday(2));
    await addTask("Finished", managerId, daysFromToday(-3), "done");
    await addTask("Late", managerId, daysFromToday(-4));
    await addTask("Middle", managerId, daysFromToday(9));

    const d = await get(managerId);
    expect(d.tasks.mine.next.map((t) => t.title)).toEqual(["Late", "Soon", "Middle"]);
    expect(d.tasks.mine.next[0]).toMatchObject({ overdue: true, dueDate: daysFromToday(-4) });
    expect(d.tasks.mine.next[1]).toMatchObject({ overdue: false });
    expect(d.tasks.mine).toMatchObject({ pending: 4, overdue: 1 });
    expect(Object.keys(d.tasks.mine.next[0]!).sort()).toEqual([
      "dueDate",
      "id",
      "overdue",
      "title",
    ]);
  });

  it("never counts another wedding's tasks", async () => {
    const { adminId } = await setup();
    const other = await setup();
    await other.addTask("Theirs", other.adminId, daysFromToday(-1));
    const d = await get(adminId);
    expect(d.tasks).toEqual({
      total: 0,
      done: 0,
      pending: 0,
      overdue: 0,
      mine: { total: 0, pending: 0, overdue: 0, next: [] },
    });
    expect(d.setup.tasks).toBe(false);
  });

  it("tells 'nothing assigned to me' from 'all mine are done'", async () => {
    const { adminId, addManager, addTask } = await setup();
    const managerId = await addManager();
    await addTask("Admin's", adminId, daysFromToday(3));
    await addTask("Admin's too", adminId, daysFromToday(4));

    const unassigned = (await get(managerId)).tasks.mine;
    expect(unassigned).toEqual({ total: 0, pending: 0, overdue: 0, next: [] });

    await addTask("Done one", managerId, daysFromToday(-1), "done");
    const allDone = (await get(managerId)).tasks.mine;
    expect(allDone).toEqual({ total: 1, pending: 0, overdue: 0, next: [] });
  });

  it("loads only the next three, but counts every open task", async () => {
    const { adminId, addTask } = await setup();
    for (let i = 1; i <= 8; i++) await addTask(`Task ${i}`, adminId, daysFromToday(i));
    const d = await get(adminId);
    expect(d.tasks.mine.next.map((t) => t.title)).toEqual(["Task 1", "Task 2", "Task 3"]);
    expect(d.tasks.mine).toMatchObject({ total: 8, pending: 8 });
    expect(d.tasks).toMatchObject({ total: 8, pending: 8 });
  });
});

describe("setup checklist and invites", () => {
  it("shows invites to Admins only, and ticks 'team' once someone has joined", async () => {
    const { adminId, addManager, weddingId } = await setup();
    const managerId = await addManager();
    await MemberInvite.create({
      weddingId,
      name: "Sita",
      email: "sita@example.com",
      role: "manager",
      tokenHash: "x".repeat(64),
      invitedBy: adminId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await MemberInvite.create({
      weddingId,
      name: "Expired",
      email: "old@example.com",
      role: "manager",
      tokenHash: "y".repeat(64),
      invitedBy: adminId,
      expiresAt: new Date(Date.now() - 1000),
    });
    const admin = await get(adminId);
    expect(admin.pendingInviteNames).toEqual(["Sita"]);
    expect(admin.setup.team).toBe(true);
    const manager = await get(managerId);
    expect(manager).not.toHaveProperty("pendingInviteNames");
    expect(manager.setup.team).toBe(true);
  });

  it("does not tick 'team' for a pending invite alone, so it cannot un-tick when it expires", async () => {
    const { adminId, weddingId } = await setup();
    await MemberInvite.create({
      weddingId,
      name: "Sita",
      email: "sita@example.com",
      role: "manager",
      tokenHash: "w".repeat(64),
      invitedBy: adminId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const d = await get(adminId);
    expect(d.pendingInviteNames).toEqual(["Sita"]);
    expect(d.setup.team).toBe(false);
  });

  it("is 'team' false while the creator is alone, and another wedding's people don't count", async () => {
    const { adminId } = await setup();
    await setup();
    expect((await get(adminId)).setup.team).toBe(false);
  });

  it("does not show another wedding's invites", async () => {
    const { adminId } = await setup();
    const other = await setup();
    await MemberInvite.create({
      weddingId: other.weddingId,
      name: "Theirs",
      email: "theirs@example.com",
      role: "manager",
      tokenHash: "z".repeat(64),
      invitedBy: other.adminId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const d = await get(adminId);
    expect(d.pendingInviteNames).toEqual([]);
    expect(d.setup.team).toBe(false);
  });
});
