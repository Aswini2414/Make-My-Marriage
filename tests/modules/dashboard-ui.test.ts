import { describe, expect, it } from "vitest";
import {
  dueText,
  invitesText,
  setupItems,
  showChecklist,
  taskProgress,
} from "@/modules/dashboard/format";

const none = { events: false, tasks: false, guests: false, team: false };

describe("setup checklist", () => {
  it("starts with nothing ticked and ticks from real data", () => {
    expect(setupItems(none).map((i) => i.done)).toEqual([false, false, false, false]);
    const items = setupItems({ ...none, events: true, tasks: true });
    expect(items.filter((i) => i.done).map((i) => i.key)).toEqual(["events", "tasks"]);
  });

  it("links every item to its page, built or not", () => {
    expect(setupItems(none).map((i) => i.href)).toEqual([
      "/events",
      "/tasks",
      "/guests",
      "/members",
    ]);
  });

  it("is hidden once every item that can be done yet is done", () => {
    expect(showChecklist(setupItems(none))).toBe(true);
    expect(showChecklist(setupItems({ ...none, events: true, tasks: true }))).toBe(true);
    // Guests are not built yet, so they cannot keep the checklist open.
    expect(
      showChecklist(setupItems({ events: true, tasks: true, guests: false, team: true })),
    ).toBe(false);
    expect(showChecklist(setupItems({ events: true, tasks: true, guests: true, team: true }))).toBe(
      false,
    );
  });
});

describe("task card text", () => {
  it("works out the bar width, 0 when there are no tasks", () => {
    expect(taskProgress({ done: 30, total: 48 })).toBe(63);
    expect(taskProgress({ done: 0, total: 0 })).toBe(0);
    expect(taskProgress({ done: 5, total: 5 })).toBe(100);
  });

  it("words the due date, with the year only when it is not this year", () => {
    const today = "2026-11-05";
    expect(dueText({ dueDate: "2026-10-20", overdue: true }, today)).toBe("Overdue · 20 Oct");
    expect(dueText({ dueDate: "2026-11-28", overdue: false }, today)).toBe("Due 28 Nov");
    expect(dueText({ dueDate: "2027-01-05", overdue: false }, today)).toBe("Due 5 Jan 2027");
    expect(dueText({ dueDate: "2025-12-31", overdue: true }, today)).toBe("Overdue · 31 Dec 2025");
  });
});

describe("invites strip text", () => {
  it("lists one, two and three names", () => {
    expect(invitesText(["Anil"])).toBe("1 invite waiting to be accepted: Anil");
    expect(invitesText(["Anil", "Sita"])).toBe("2 invites waiting to be accepted: Anil and Sita");
    expect(invitesText(["Anil", "Sita", "Ravi"])).toBe(
      "3 invites waiting to be accepted: Anil, Sita and Ravi",
    );
  });
});
