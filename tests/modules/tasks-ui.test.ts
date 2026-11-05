import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { todayIST } from "@/lib/dates";
import { Event } from "@/modules/events/model";
import {
  canChangeStatus,
  filterTasks,
  filtersToQuery,
  hasActiveFilters,
  NO_FILTERS,
  overdueLabel,
  parseFilters,
  percent,
  sortTasks,
  statNotes,
  summarize,
  type TaskFilters,
  withStatus,
  withToday,
} from "@/modules/tasks/format";
import { Task } from "@/modules/tasks/model";
import { listTasks } from "@/modules/tasks/service";
import type { TaskItem } from "@/modules/tasks/types";
import { createMember, emptyDb, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

function daysFromToday(n: number): string {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const item = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: "a".repeat(24),
  title: "Book caterer",
  assignee: { id: "u1", name: "Leela", initial: "L", removed: false },
  dueDate: "2027-02-01",
  status: "todo",
  overdue: false,
  daysOverdue: 0,
  ...over,
});

describe("overdueLabel", () => {
  it("says 'Due yesterday' for one day and 'N days overdue' after that", () => {
    expect(overdueLabel(1)).toBe("Due yesterday");
    expect(overdueLabel(2)).toBe("2 days overdue");
    expect(overdueLabel(6)).toBe("6 days overdue");
  });
});

describe("stat texts", () => {
  it("rounds percentages and copes with no tasks", () => {
    expect(percent(15, 24)).toBe(63);
    expect(percent(9, 24)).toBe(38);
    expect(percent(0, 0)).toBe(0);
  });

  it("words the notes under the four cards", () => {
    expect(statNotes({ total: 24, todo: 15, done: 9, overdue: 3 })).toEqual({
      total: "Across all events",
      todo: "63% remaining",
      done: "38% completed",
      overdue: "Requires attention",
    });
    expect(statNotes({ total: 0, todo: 0, done: 0, overdue: 0 })).toMatchObject({
      todo: "All clear",
      done: "0% completed",
      overdue: "None overdue",
    });
  });
});

describe("who can change a task's status", () => {
  it("is the assignee or any Admin", () => {
    const task = item();
    expect(canChangeStatus(task, { userId: "u1", role: "manager" })).toBe(true);
    expect(canChangeStatus(task, { userId: "u2", role: "admin" })).toBe(true);
    expect(canChangeStatus(task, { userId: "u2", role: "manager" })).toBe(false);
  });
});

describe("withStatus (the optimistic update)", () => {
  const today = "2027-03-10";

  it("finishing an overdue task clears its overdue flag", () => {
    const late = item({ dueDate: "2027-03-01", overdue: true, daysOverdue: 9 });
    const done = withStatus(late, "done", today);
    expect(done).toMatchObject({ status: "done", overdue: false, daysOverdue: 0 });
    expect(typeof done.completedAt).toBe("string");
    expect(late.status).toBe("todo");
  });

  it("reopening brings the overdue flag back and drops who finished it", () => {
    const finished = item({
      status: "done",
      dueDate: "2027-03-01",
      completedAt: "2027-03-02T10:00:00.000Z",
      completedBy: { id: "u1", name: "Leela" },
    });
    const reopened = withStatus(finished, "todo", today);
    expect(reopened).toMatchObject({ status: "todo", overdue: true, daysOverdue: 9 });
    expect(reopened).not.toHaveProperty("completedAt");
    expect(reopened).not.toHaveProperty("completedBy");
  });
});

describe("sortTasks", () => {
  it("puts open tasks first by due date, then Done tasks", () => {
    const sorted = sortTasks([
      item({ id: "3", title: "done early", status: "done", dueDate: "2027-01-01" }),
      item({ id: "2", title: "later", dueDate: "2027-03-01" }),
      item({ id: "1", title: "sooner", dueDate: "2027-02-01" }),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(["sooner", "later", "done early"]);
  });
});

describe("filters in the address bar", () => {
  it("round-trips, leaving defaults out", () => {
    const filters: TaskFilters = {
      view: "overdue",
      status: "todo",
      eventId: "e".repeat(24),
      q: "cater",
    };
    const query = filtersToQuery(filters);
    expect(query).toBe(`view=overdue&status=todo&event=${"e".repeat(24)}&q=cater`);
    expect(parseFilters(new URLSearchParams(query))).toEqual(filters);
    expect(filtersToQuery(NO_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(NO_FILTERS);
  });

  it("ignores values it does not know", () => {
    expect(parseFilters(new URLSearchParams("view=everything&status=maybe"))).toEqual(NO_FILTERS);
  });

  it("knows when anything narrows the list", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, view: "mine" })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, q: "  " })).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, status: "done" })).toBe(true);
  });
});

describe("the page's filters and counts match the API's", () => {
  it("gives the same tasks, in the same order, for every filter", async () => {
    const admin = await createMember("admin");
    const adminId = String(admin.user._id);
    const manager = await createMember("manager", undefined, admin.weddingId);
    const managerId = String(manager.user._id);
    const event = await Event.create({
      weddingId: admin.weddingId,
      name: "Reception",
      type: "Reception",
      date: "2027-02-14",
      time: "19:00",
      venueName: "Hall",
    });
    const other = await Event.create({
      weddingId: admin.weddingId,
      name: "Haldi",
      type: "Haldi",
      date: "2027-02-13",
      time: "10:00",
      venueName: "Home",
    });
    const rows: [string, string, string, "todo" | "done", typeof event | undefined][] = [
      ["Book caterer", adminId, daysFromToday(-4), "todo", event],
      ["Book DJ (loud)", managerId, daysFromToday(-1), "todo", event],
      ["Hire photographer", adminId, daysFromToday(0), "todo", undefined],
      ["Order flowers", managerId, daysFromToday(6), "todo", other],
      ["Print cards", adminId, daysFromToday(-9), "done", other],
      ["Book band", managerId, daysFromToday(3), "done", undefined],
      ["Book the mandapam", adminId, daysFromToday(3), "todo", event],
    ];
    for (const [title, assigneeId, dueDate, status, ev] of rows) {
      await Task.create({
        weddingId: admin.weddingId,
        title,
        assigneeId,
        dueDate,
        status,
        ...(ev ? { eventId: ev._id } : {}),
        createdBy: adminId,
        ...(status === "done" ? { completedAt: new Date(), completedBy: adminId } : {}),
      });
    }

    const weddingId = String(admin.weddingId);
    for (const actor of [
      { userId: adminId, role: "admin" as const },
      { userId: managerId, role: "manager" as const },
    ]) {
      const all = await listTasks(weddingId, actor, {});
      expect(all.items).toHaveLength(7);
      // The counts the page works out itself equal the API's.
      expect(summarize(all.items, actor.userId)).toEqual({ summary: all.summary, mine: all.mine });

      const filterSets: TaskFilters[] = [];
      for (const view of ["all", "mine", "overdue"] as const) {
        for (const status of [undefined, "todo", "done"] as const) {
          for (const eventId of [undefined, String(event._id), String(other._id)]) {
            for (const q of ["", "BOOK", "(loud)", "zzz"]) {
              filterSets.push({
                view,
                ...(status ? { status } : {}),
                ...(eventId ? { eventId } : {}),
                q,
              });
            }
          }
        }
      }
      for (const filters of filterSets) {
        const fromApi = await listTasks(weddingId, actor, {
          view: filters.view,
          status: filters.status,
          eventId: filters.eventId,
          q: filters.q || undefined,
        });
        const inBrowser = filterTasks(all.items, filters, actor.userId);
        expect(inBrowser.map((t) => t.id)).toEqual(fromApi.items.map((t) => t.id));
      }
    }
  }, 60_000);

  it("sorts the way the API does", async () => {
    const admin = await createMember("admin");
    const adminId = String(admin.user._id);
    for (const [title, dueDate, status] of [
      ["c", daysFromToday(5), "todo"],
      ["a", daysFromToday(-5), "done"],
      ["b", daysFromToday(-2), "todo"],
      ["d", daysFromToday(1), "todo"],
    ] as const) {
      await Task.create({
        weddingId: admin.weddingId,
        title,
        assigneeId: adminId,
        dueDate,
        status,
        createdBy: adminId,
      });
    }
    const { items } = await listTasks(
      String(admin.weddingId),
      { userId: adminId, role: "admin" },
      {},
    );
    const shuffled = [items[2]!, items[0]!, items[3]!, items[1]!];
    expect(sortTasks(shuffled).map((t) => t.id)).toEqual(items.map((t) => t.id));
  });
});

describe("withToday (a tab left open past midnight)", () => {
  it("turns a task overdue when its due date has passed, and back when it has not", () => {
    const due = item({ dueDate: "2027-02-01", overdue: false, daysOverdue: 0 });
    expect(withToday(due, "2027-02-01")).toBe(due);
    expect(withToday(due, "2027-02-04")).toMatchObject({ overdue: true, daysOverdue: 3 });
    const late = item({ dueDate: "2027-02-01", overdue: true, daysOverdue: 3 });
    expect(withToday(late, "2027-01-30")).toMatchObject({ overdue: false, daysOverdue: 0 });
  });

  it("never marks a done task overdue, and keeps the same object when nothing changes", () => {
    const done = item({ status: "done", dueDate: "2027-02-01", overdue: false, daysOverdue: 0 });
    expect(withToday(done, "2027-03-01")).toBe(done);
  });
});
