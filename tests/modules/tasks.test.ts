import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DELETE as deleteRoute,
  GET as getRoute,
  PATCH as patchRoute,
} from "@/app/api/tasks/[id]/route";
import { POST as doneRoute } from "@/app/api/tasks/[id]/done/route";
import { POST as reopenRoute } from "@/app/api/tasks/[id]/reopen/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/tasks/route";
import { GET as impactRoute } from "@/app/api/events/[id]/delete-impact/route";
import { DELETE as deleteEventRoute } from "@/app/api/events/[id]/route";
import { DELETE as removeMemberRoute } from "@/app/api/members/[id]/route";
import { DELETE as deleteWeddingRoute } from "@/app/api/wedding/route";
import { todayIST } from "@/lib/dates";
import { Event } from "@/modules/events/model";
import { Membership } from "@/modules/members/model";
import { Task } from "@/modules/tasks/model";
import type { TaskItem } from "@/modules/tasks/types";
import { taskOverdue } from "@/modules/tasks/overdue";
import { createTaskSchema, listTasksQuery, updateTaskSchema } from "@/modules/tasks/schema";
import { Wedding } from "@/modules/weddings/model";
import { createMember, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

type Route = (req: never, ctx: never) => Promise<Response>;
const call = (route: Route, req: unknown, id?: string) =>
  route(req as never, { params: Promise.resolve({ id }) } as never);

/** A date some days from today in India Standard Time, as YYYY-MM-DD. */
function daysFromToday(n: number): string {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function errorOf(res: Response) {
  return (await res.json()).error as {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

/** A wedding with an Admin, plus helpers to add Managers. */
async function setup() {
  const admin = await createMember("admin");
  const adminId = String(admin.user._id);
  const addManager = async () => {
    const m = await createMember("manager", undefined, admin.weddingId);
    return String(m.user._id);
  };
  return { weddingId: admin.weddingId, adminId, addManager };
}

const create = async (userId: string, body: unknown) =>
  call(createRoute, await request("/api/tasks", { method: "POST", userId, body }));
const createOk = async (userId: string, body: unknown) => {
  const res = await create(userId, body);
  expect(res.status).toBe(201);
  return (await res.json()).task as TaskItem;
};
const list = async (userId: string, query = "") => {
  const res = await call(listRoute, await request(`/api/tasks${query}`, { userId }));
  expect(res.status).toBe(200);
  return res.json();
};
const titles = (body: { items: { title: string }[] }) => body.items.map((t) => t.title);
const act = async (route: Route, userId: string, id: string) =>
  call(route, await request("/api/tasks/x", { method: "POST", userId }), id);

describe("the overdue rule", () => {
  const today = "2027-03-10";

  it("is overdue only when still To do and due before today", () => {
    expect(taskOverdue({ status: "todo", dueDate: "2027-03-09" }, today)).toEqual({
      overdue: true,
      daysOverdue: 1,
    });
    expect(taskOverdue({ status: "todo", dueDate: "2027-03-10" }, today)).toEqual({
      overdue: false,
      daysOverdue: 0,
    });
    expect(taskOverdue({ status: "todo", dueDate: "2027-03-11" }, today).overdue).toBe(false);
    expect(taskOverdue({ status: "done", dueDate: "2027-03-01" }, today)).toEqual({
      overdue: false,
      daysOverdue: 0,
    });
  });

  it("counts whole days, across a month end", () => {
    expect(taskOverdue({ status: "todo", dueDate: "2027-02-27" }, today).daysOverdue).toBe(11);
  });

  it("uses today in India Standard Time by default", () => {
    expect(taskOverdue({ status: "todo", dueDate: todayIST() }).overdue).toBe(false);
    expect(taskOverdue({ status: "todo", dueDate: daysFromToday(-1) })).toEqual({
      overdue: true,
      daysOverdue: 1,
    });
  });
});

describe("validation", () => {
  const valid = { title: "Book caterer", assigneeId: "a".repeat(24), dueDate: "2027-02-01" };

  it("needs a title, an assignee and a due date", () => {
    const result = createTaskSchema.safeParse({});
    expect(Object.keys(result.error?.flatten().fieldErrors ?? {}).sort()).toEqual([
      "assigneeId",
      "dueDate",
      "title",
    ]);
  });

  it("gives the title error the app's wording", () => {
    const result = createTaskSchema.safeParse({ ...valid, title: "   " });
    expect(result.error?.flatten().fieldErrors.title?.[0]).toBe("Please give the task a title.");
  });

  it("treats the form's empty optional fields as not set", () => {
    const result = createTaskSchema.parse({ ...valid, eventId: "", note: " " });
    expect(result).toEqual(valid);
  });

  it("rejects an impossible date, a long note and control characters", () => {
    expect(createTaskSchema.safeParse({ ...valid, dueDate: "2027-02-30" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...valid, note: "x".repeat(1001) }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...valid, title: "a\u0000b" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...valid, note: "line one\nline two" }).success).toBe(true);
  });

  it("keeps the due date within five years back and ten ahead, like the date picker", () => {
    const ok = (dueDate: string) => createTaskSchema.safeParse({ ...valid, dueDate }).success;
    expect(ok(daysFromToday(0))).toBe(true);
    expect(ok("2000-01-01")).toBe(false);
    expect(ok("0000-01-01")).toBe(false);
    expect(ok("9999-12-31")).toBe(false);
    expect(updateTaskSchema.safeParse({ dueDate: "2000-01-01" }).success).toBe(false);
    // Editing another field of an old task never re-checks its date.
    expect(updateTaskSchema.safeParse({ title: "Renamed" }).success).toBe(true);
  });

  it("says what to do when a required field is missing, not a Zod message", () => {
    const fields = createTaskSchema.safeParse({}).error?.flatten().fieldErrors ?? {};
    expect(fields.title?.[0]).toBe("Please give the task a title.");
    expect(fields.assigneeId?.[0]).toBe("Choose who is doing this task.");
    expect(fields.dueDate?.[0]).toBe("Choose a due date.");
  });

  it("update needs a field, clears with null, and ignores status", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.parse({ eventId: null, note: "" })).toEqual({
      eventId: null,
      note: null,
    });
    expect(updateTaskSchema.parse({ title: "x", status: "done" })).toEqual({ title: "x" });
  });

  it("reads list filters, with empty values meaning no filter", () => {
    expect(listTasksQuery.parse({ view: "", status: "", q: "" })).toEqual({});
    expect(listTasksQuery.safeParse({ view: "everything" }).success).toBe(false);
  });
});

describe("create, get and list", () => {
  it("creates a task with names, and anyone may be the assignee", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    const res = await create(adminId, {
      title: "Confirm caterer headcount",
      assigneeId: managerId,
      dueDate: daysFromToday(5),
      note: "Use the Reception RSVPs",
    });
    expect(res.status).toBe(201);
    const { task } = await res.json();
    expect(task).toMatchObject({
      title: "Confirm caterer headcount",
      status: "todo",
      overdue: false,
      daysOverdue: 0,
      note: "Use the Reception RSVPs",
      assignee: { id: managerId, removed: false },
    });
    expect(task.assignee.initial).toBe(task.assignee.name[0].toUpperCase());
    expect(task.createdBy.id).toBe(adminId);
    expect(task).not.toHaveProperty("eventId");

    const got = await call(
      getRoute,
      await request(`/api/tasks/${task.id}`, { userId: managerId }),
      task.id,
    );
    expect(got.status).toBe(200);
    expect((await got.json()).task.id).toBe(task.id);
  });

  it("lets a Manager create, edit and delete tasks", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    const { id } = await createOk(managerId, {
      title: "Order sweets",
      assigneeId: adminId,
      dueDate: daysFromToday(3),
    });
    const patched = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: managerId,
        body: { title: "Order sweets and dry fruits" },
      }),
      id,
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).task.title).toBe("Order sweets and dry fruits");
    const deleted = await call(
      deleteRoute,
      await request(`/api/tasks/${id}`, { method: "DELETE", userId: managerId }),
      id,
    );
    expect(deleted.status).toBe(204);
    expect(await Task.countDocuments()).toBe(0);
  });

  it("sorts overdue first, then by due date, with Done tasks last", async () => {
    const { adminId } = await setup();
    const mk = (title: string, dueDate: string) =>
      createOk(adminId, { title, assigneeId: adminId, dueDate });
    const later = await mk("Later", daysFromToday(10));
    await mk("Soon", daysFromToday(2));
    await mk("Overdue long ago", daysFromToday(-9));
    await mk("Overdue yesterday", daysFromToday(-1));
    const doneEarly = await mk("Done, was due long ago", daysFromToday(-20));
    await act(doneRoute, adminId, doneEarly.id);
    void later;
    const body = await list(adminId);
    expect(titles(body)).toEqual([
      "Overdue long ago",
      "Overdue yesterday",
      "Soon",
      "Later",
      "Done, was due long ago",
    ]);
    expect(body.items[0]).toMatchObject({ overdue: true, daysOverdue: 9 });
    expect(body.items[4]).toMatchObject({ status: "done", overdue: false, daysOverdue: 0 });
  });

  it("filters by view, status, event, assignee and title", async () => {
    const { adminId, addManager, weddingId } = await setup();
    const managerId = await addManager();
    const event = await Event.create({
      weddingId,
      name: "Reception",
      type: "Reception",
      date: "2027-02-14",
      time: "19:00",
      venueName: "Hall",
    });
    const mk = (title: string, assigneeId: string, dueDate: string, eventId?: string) =>
      createOk(adminId, { title, assigneeId, dueDate, ...(eventId ? { eventId } : {}) });
    await mk("Book DJ", managerId, daysFromToday(4), String(event._id));
    await mk("Hire photographer", adminId, daysFromToday(-2));
    const finished = await mk("Order flowers (50%)", adminId, daysFromToday(6));
    await act(doneRoute, adminId, finished.id);

    expect(titles(await list(adminId, "?view=mine")).sort()).toEqual([
      "Hire photographer",
      "Order flowers (50%)",
    ]);
    expect(titles(await list(managerId, "?view=mine"))).toEqual(["Book DJ"]);
    expect(titles(await list(adminId, "?view=overdue"))).toEqual(["Hire photographer"]);
    expect(titles(await list(adminId, "?status=done"))).toEqual(["Order flowers (50%)"]);
    expect(titles(await list(adminId, "?status=todo")).sort()).toEqual([
      "Book DJ",
      "Hire photographer",
    ]);
    expect(titles(await list(adminId, `?eventId=${event._id}`))).toEqual(["Book DJ"]);
    expect(titles(await list(adminId, `?assigneeId=${managerId}`))).toEqual(["Book DJ"]);
    expect(titles(await list(adminId, "?q=PHOTO"))).toEqual(["Hire photographer"]);
    // Regex characters in a search are plain text.
    expect(titles(await list(adminId, `?q=${encodeURIComponent("(50%)")}`))).toEqual([
      "Order flowers (50%)",
    ]);
    expect(titles(await list(adminId, `?q=${encodeURIComponent(".*")}`))).toEqual([]);
    // Filters combine.
    expect(titles(await list(adminId, "?view=mine&status=todo"))).toEqual(["Hire photographer"]);
    expect((await list(adminId, "?view=overdue&status=done")).items).toEqual([]);
    // The event name comes with the task.
    const withEvent = (await list(adminId, `?eventId=${event._id}`)).items[0];
    expect(withEvent).toMatchObject({ eventId: String(event._id), eventName: "Reception" });
  });

  it("answers 400 for a bad filter value", async () => {
    const { adminId } = await setup();
    const res = await call(
      listRoute,
      await request("/api/tasks?view=everything", { userId: adminId }),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION_FAILED");
  });
});

describe("summary counts", () => {
  it("counts the whole wedding whatever the filters, and the member's own tasks", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    const mk = (assigneeId: string, dueDate: string) =>
      createOk(adminId, { title: `t ${dueDate} ${assigneeId.slice(-3)}`, assigneeId, dueDate });
    await mk(adminId, daysFromToday(-3)); // overdue, mine
    await mk(adminId, daysFromToday(0)); // due today: not overdue, mine
    const done = await mk(adminId, daysFromToday(-5)); // done, mine
    await act(doneRoute, adminId, done.id);
    await mk(managerId, daysFromToday(-1)); // overdue, the Manager's
    await mk(managerId, daysFromToday(7));

    const filtered = await list(adminId, "?view=overdue");
    expect(filtered.items).toHaveLength(2);
    expect(filtered.summary).toEqual({ total: 5, todo: 4, done: 1, overdue: 2 });
    expect(filtered.mine).toEqual({ total: 3, todo: 2, done: 1, overdue: 1 });
    const managers = await list(managerId, "?q=nothing-matches-this");
    expect(managers.items).toEqual([]);
    expect(managers.summary).toEqual({ total: 5, todo: 4, done: 1, overdue: 2 });
    expect(managers.mine).toEqual({ total: 2, todo: 2, done: 0, overdue: 1 });
  });

  it("is all zeros when there are no tasks, and ignores other weddings", async () => {
    const a = await setup();
    const b = await setup();
    await createOk(b.adminId, {
      title: "Theirs",
      assigneeId: b.adminId,
      dueDate: daysFromToday(-1),
    });
    const body = await list(a.adminId);
    expect(body.items).toEqual([]);
    expect(body.summary).toEqual({ total: 0, todo: 0, done: 0, overdue: 0 });
    expect(body.mine).toEqual({ total: 0, todo: 0, done: 0, overdue: 0 });
  });
});

describe("who can be assigned", () => {
  it("accepts an active Admin or Manager of this wedding", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    await createOk(adminId, {
      title: "To the manager",
      assigneeId: managerId,
      dueDate: daysFromToday(1),
    });
    await createOk(managerId, {
      title: "To the admin",
      assigneeId: adminId,
      dueDate: daysFromToday(1),
    });
  });

  it("refuses someone from another wedding, an unknown id and a removed member", async () => {
    const { adminId, addManager, weddingId } = await setup();
    const other = await setup();
    const removedId = await addManager();
    await Membership.updateOne(
      { weddingId, userId: removedId },
      { status: "removed", removedAt: new Date() },
    );
    for (const assigneeId of [other.adminId, new Types.ObjectId().toHexString(), removedId]) {
      const res = await create(adminId, { title: "Nope", assigneeId, dueDate: daysFromToday(1) });
      expect(res.status).toBe(400);
      const err = await errorOf(res);
      expect(err.code).toBe("ASSIGNEE_NOT_MEMBER");
      expect(err.fields).toHaveProperty("assigneeId");
    }
    expect(await Task.countDocuments()).toBe(0);
  });

  it("checks the new assignee on edit too", async () => {
    const { adminId } = await setup();
    const other = await setup();
    const { id } = await createOk(adminId, {
      title: "T",
      assigneeId: adminId,
      dueDate: daysFromToday(1),
    });
    const res = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: adminId,
        body: { assigneeId: other.adminId },
      }),
      id,
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("ASSIGNEE_NOT_MEMBER");
    expect(String((await Task.findById(id).lean())?.assigneeId)).toBe(adminId);
  });
});

describe("marking done and reopening", () => {
  it("lets the assignee (a Manager) finish and reopen their own task", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    const { id } = await createOk(adminId, {
      title: "Mine",
      assigneeId: managerId,
      dueDate: daysFromToday(2),
    });
    const done = await act(doneRoute, managerId, id);
    expect(done.status).toBe(200);
    const { task } = await done.json();
    expect(task).toMatchObject({ status: "done", completedBy: { id: managerId } });
    expect(typeof task.completedAt).toBe("string");
    const reopened = await act(reopenRoute, managerId, id);
    expect(reopened.status).toBe(200);
    const again = (await reopened.json()).task;
    expect(again.status).toBe("todo");
    expect(again).not.toHaveProperty("completedAt");
    expect(again).not.toHaveProperty("completedBy");
  });

  it("lets any Admin finish and reopen someone else's task", async () => {
    const { adminId, addManager, weddingId } = await setup();
    const managerId = await addManager();
    const second = await createMember("admin", undefined, weddingId);
    const { id } = await createOk(adminId, {
      title: "Manager's",
      assigneeId: managerId,
      dueDate: daysFromToday(2),
    });
    expect((await act(doneRoute, String(second.user._id), id)).status).toBe(200);
    expect((await act(reopenRoute, adminId, id)).status).toBe(200);
  });

  it("refuses a Manager who is not the assignee, for both done and reopen", async () => {
    const { adminId, addManager } = await setup();
    const assigneeId = await addManager();
    const bystander = await addManager();
    const { id } = await createOk(adminId, {
      title: "Not yours",
      assigneeId,
      dueDate: daysFromToday(2),
    });
    const refused = await act(doneRoute, bystander, id);
    expect(refused.status).toBe(403);
    expect((await errorOf(refused)).code).toBe("NOT_ASSIGNEE");
    expect((await Task.findById(id).lean())?.status).toBe("todo");

    await act(doneRoute, assigneeId, id);
    const refusedReopen = await act(reopenRoute, bystander, id);
    expect(refusedReopen.status).toBe(403);
    expect((await Task.findById(id).lean())?.status).toBe("done");
  });

  it("is harmless to repeat: done twice keeps the first finisher", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    const { id } = await createOk(adminId, {
      title: "Once",
      assigneeId: managerId,
      dueDate: daysFromToday(2),
    });
    await act(doneRoute, managerId, id);
    const first = await Task.findById(id).lean();
    await new Promise((r) => setTimeout(r, 15));
    const again = await act(doneRoute, adminId, id);
    expect(again.status).toBe(200);
    const second = await Task.findById(id).lean();
    expect(second?.completedAt?.getTime()).toBe(first?.completedAt?.getTime());
    expect(String(second?.completedBy)).toBe(managerId);
    // Reopening an open task is also fine.
    await act(reopenRoute, managerId, id);
    expect((await act(reopenRoute, managerId, id)).status).toBe(200);
  });

  it("two finishers at the same moment leave one completedBy", async () => {
    const { adminId, addManager } = await setup();
    const managerId = await addManager();
    const { id } = await createOk(adminId, {
      title: "Race",
      assigneeId: managerId,
      dueDate: daysFromToday(2),
    });
    const results = await Promise.all([act(doneRoute, managerId, id), act(doneRoute, adminId, id)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const stored = await Task.findById(id).lean();
    expect(stored?.status).toBe("done");
    expect([managerId, adminId]).toContain(String(stored?.completedBy));
  });

  it("PATCH can't change the status", async () => {
    const { adminId } = await setup();
    const { id } = await createOk(adminId, {
      title: "Stay open",
      assigneeId: adminId,
      dueDate: daysFromToday(2),
    });
    const res = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: adminId,
        body: { title: "Renamed", status: "done" },
      }),
      id,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).task).toMatchObject({ title: "Renamed", status: "todo" });
  });
});

describe("the linked event", () => {
  it("links an event of this wedding, and clears the link with null", async () => {
    const { adminId, weddingId } = await setup();
    const event = await Event.create({
      weddingId,
      name: "Haldi",
      type: "Haldi",
      date: "2027-02-13",
      time: "10:00",
      venueName: "Home",
    });
    const { id } = await createOk(adminId, {
      title: "Haldi setup",
      assigneeId: adminId,
      dueDate: daysFromToday(3),
      eventId: String(event._id),
    });
    expect((await Task.findById(id).lean())?.eventId).toEqual(event._id);
    const res = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: adminId,
        body: { eventId: null },
      }),
      id,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).task).not.toHaveProperty("eventId");
    expect((await Task.findById(id).lean())?.eventId).toBeUndefined();
  });

  it("answers an unknown event and another wedding's event in exactly the same way", async () => {
    const { adminId } = await setup();
    const other = await setup();
    const foreign = await Event.create({
      weddingId: other.weddingId,
      name: "Theirs",
      type: "Haldi",
      date: "2027-02-13",
      time: "10:00",
      venueName: "Home",
    });
    const answers = [];
    for (const eventId of [String(foreign._id), new Types.ObjectId().toHexString()]) {
      const res = await create(adminId, {
        title: "Bad link",
        assigneeId: adminId,
        dueDate: daysFromToday(1),
        eventId,
      });
      expect(res.status).toBe(400);
      answers.push(await errorOf(res));
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[0]?.fields).toHaveProperty("eventId");
    expect(await Task.countDocuments()).toBe(0);
  });

  it("checks the event on edit too", async () => {
    const { adminId } = await setup();
    const other = await setup();
    const foreign = await Event.create({
      weddingId: other.weddingId,
      name: "Theirs",
      type: "Haldi",
      date: "2027-02-13",
      time: "10:00",
      venueName: "Home",
    });
    const { id } = await createOk(adminId, {
      title: "T",
      assigneeId: adminId,
      dueDate: daysFromToday(1),
    });
    const res = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: adminId,
        body: { eventId: String(foreign._id) },
      }),
      id,
    );
    expect(res.status).toBe(400);
  });

  it("keeps tasks when their event is deleted, with the link cleared and a real impact count", async () => {
    const { adminId, weddingId } = await setup();
    const doomed = await Event.create({
      weddingId,
      name: "Doomed",
      type: "Haldi",
      date: "2027-02-13",
      time: "10:00",
      venueName: "Home",
    });
    const safe = await Event.create({
      weddingId,
      name: "Safe",
      type: "Sangeet",
      date: "2027-02-12",
      time: "18:00",
      venueName: "Hall",
    });
    const mk = (title: string, eventId?: string) =>
      createOk(adminId, {
        title,
        assigneeId: adminId,
        dueDate: daysFromToday(2),
        ...(eventId ? { eventId } : {}),
      });
    const a = await mk("On doomed 1", String(doomed._id));
    await mk("On doomed 2", String(doomed._id));
    await mk("On safe", String(safe._id));
    await mk("No event");

    const impact = await call(
      impactRoute,
      await request(`/api/events/${doomed._id}/delete-impact`, { userId: adminId }),
      String(doomed._id),
    );
    expect((await impact.json()).tasks).toBe(2);

    const res = await call(
      deleteEventRoute,
      await request(`/api/events/${doomed._id}`, { method: "DELETE", userId: adminId }),
      String(doomed._id),
    );
    expect(res.status).toBe(204);
    expect(await Task.countDocuments()).toBe(4);
    expect((await Task.findById(a.id).lean())?.eventId).toBeUndefined();
    expect(await Task.countDocuments({ eventId: safe._id })).toBe(1);
    const body = await list(adminId);
    expect(body.items.find((t: { id: string }) => t.id === a.id)).not.toHaveProperty("eventName");
  });
});

describe("a member who is removed or leaves", () => {
  it("keeps their tasks, shows them as removed, and lets an Admin reassign", async () => {
    const { adminId, addManager, weddingId } = await setup();
    const leaverId = await addManager();
    const newcomerId = await addManager();
    const { id } = await createOk(adminId, {
      title: "Left behind",
      assigneeId: leaverId,
      dueDate: daysFromToday(4),
    });
    const leaverName = (await list(adminId)).items[0].assignee.name;

    const membership = await Membership.findOne({ weddingId, userId: leaverId });
    const removed = await call(
      removeMemberRoute,
      await request(`/api/members/${membership!._id}`, { method: "DELETE", userId: adminId }),
      String(membership!._id),
    );
    expect(removed.status).toBe(204);

    const afterRemoval = (await list(adminId)).items;
    expect(afterRemoval).toHaveLength(1);
    expect(afterRemoval[0].assignee).toMatchObject({
      id: leaverId,
      name: leaverName,
      removed: true,
    });
    // The removed person still counts in the totals.
    expect((await list(adminId)).summary.total).toBe(1);

    // Another Manager can reassign it, but only to an active member.
    const refused = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: newcomerId,
        body: { assigneeId: leaverId },
      }),
      id,
    );
    expect(refused.status).toBe(400);
    const reassigned = await call(
      patchRoute,
      await request(`/api/tasks/${id}`, {
        method: "PATCH",
        userId: newcomerId,
        body: { assigneeId: newcomerId },
      }),
      id,
    );
    expect(reassigned.status).toBe(200);
    expect((await reassigned.json()).task.assignee).toMatchObject({
      id: newcomerId,
      removed: false,
    });
  });

  it("shows the person as active again if they rejoin", async () => {
    const { adminId, addManager, weddingId } = await setup();
    const managerId = await addManager();
    await createOk(adminId, {
      title: "Comes back",
      assigneeId: managerId,
      dueDate: daysFromToday(4),
    });
    await Membership.updateOne(
      { weddingId, userId: managerId },
      { status: "removed", removedAt: new Date() },
    );
    expect((await list(adminId)).items[0].assignee.removed).toBe(true);
    await Membership.updateOne(
      { weddingId, userId: managerId },
      { status: "active", $unset: { removedAt: 1 } },
    );
    expect((await list(adminId)).items[0].assignee.removed).toBe(false);
  });
});

describe("access", () => {
  it("answers 401 without a session on every route", async () => {
    const id = new Types.ObjectId().toHexString();
    const checks: [Route, string, string?][] = [
      [listRoute, "/api/tasks"],
      [createRoute, "/api/tasks", "POST"],
      [getRoute, `/api/tasks/${id}`],
      [patchRoute, `/api/tasks/${id}`, "PATCH"],
      [deleteRoute, `/api/tasks/${id}`, "DELETE"],
      [doneRoute, `/api/tasks/${id}/done`, "POST"],
      [reopenRoute, `/api/tasks/${id}/reopen`, "POST"],
    ];
    for (const [route, path, method] of checks) {
      const res = await call(
        route,
        await request(path, {
          method,
          body: method === "POST" || method === "PATCH" ? {} : undefined,
        }),
        id,
      );
      expect(res.status).toBe(401);
    }
  });

  it("answers 404 for another wedding's task on every route, and leaves it alone", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await createOk(a.adminId, {
      title: "A's task",
      assigneeId: a.adminId,
      dueDate: daysFromToday(2),
    });

    const attempts: [Route, string, string | undefined, unknown][] = [
      [getRoute, `/api/tasks/${id}`, undefined, undefined],
      [patchRoute, `/api/tasks/${id}`, "PATCH", { title: "Hijacked" }],
      [doneRoute, `/api/tasks/${id}/done`, "POST", undefined],
      [reopenRoute, `/api/tasks/${id}/reopen`, "POST", undefined],
      [deleteRoute, `/api/tasks/${id}`, "DELETE", undefined],
    ];
    for (const [route, path, method, body] of attempts) {
      const res = await call(route, await request(path, { method, userId: b.adminId, body }), id);
      expect(res.status).toBe(404);
      expect((await errorOf(res)).code).toBe("NOT_FOUND");
    }
    const stored = await Task.findById(id).lean();
    expect(stored?.title).toBe("A's task");
    expect(stored?.status).toBe("todo");
    const theirs = await list(b.adminId);
    expect(theirs.items).toEqual([]);
    expect(theirs.summary.total).toBe(0);
  });

  it("answers 404 for a malformed or unknown id", async () => {
    const { adminId } = await setup();
    for (const id of ["nope", new Types.ObjectId().toHexString()]) {
      const res = await call(getRoute, await request(`/api/tasks/${id}`, { userId: adminId }), id);
      expect(res.status).toBe(404);
    }
  });

  it("refuses a write from another site", async () => {
    const { adminId } = await setup();
    const res = await call(
      createRoute,
      await request("/api/tasks", {
        method: "POST",
        userId: adminId,
        origin: "https://evil.example",
        body: { title: "x", assigneeId: adminId, dueDate: daysFromToday(1) },
      }),
    );
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("FORBIDDEN_ORIGIN");
  });
});

describe("deleting the wedding", () => {
  it("removes its tasks and leaves another wedding's alone", async () => {
    const a = await setup();
    const b = await setup();
    await createOk(a.adminId, { title: "A1", assigneeId: a.adminId, dueDate: daysFromToday(1) });
    await createOk(a.adminId, { title: "A2", assigneeId: a.adminId, dueDate: daysFromToday(2) });
    await createOk(b.adminId, { title: "B1", assigneeId: b.adminId, dueDate: daysFromToday(1) });
    const slug = (await Wedding.findById(a.weddingId).lean())!.slug;
    const res = await call(
      deleteWeddingRoute,
      await request("/api/wedding", {
        method: "DELETE",
        userId: a.adminId,
        body: { confirmSlug: slug },
      }),
    );
    expect(res.status).toBe(204);
    expect(await Task.countDocuments({ weddingId: a.weddingId })).toBe(0);
    expect(await Task.countDocuments({ weddingId: b.weddingId })).toBe(1);
  });
});
