import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import mongoose, { Types } from "mongoose";
import Papa from "papaparse";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as summaryRoute } from "@/app/api/guests/summary/route";
import { GET as listRoute } from "@/app/api/guests/route";
import { Event } from "@/modules/events/model";
import {
  deleteImpactLine,
  eventChips,
  type FetchPage,
  filterImportRows,
  guestEventNames,
  guestFiltersToQuery,
  hasActiveGuestFilters,
  importCounts,
  importRowMessage,
  importRowStatus,
  listQuery,
  NO_FILTERS,
  parseGuestFilters,
  rowsToCommit,
  showingText,
  skippedLine,
  walkToPage,
} from "@/modules/guests/format";
import { commitImport, previewImport } from "@/modules/guests/import";
import { Guest } from "@/modules/guests/model";
import { createGuestSchema } from "@/modules/guests/schema";
import { listGuestsQuery } from "@/modules/guests/schema";
import { createGuest as saveGuest, guestSummary, listGuests } from "@/modules/guests/service";
import type { GuestList, ImportRow } from "@/modules/guests/types";
import { createMember, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

/** Saves a guest the way the route does: the body goes through the schema first. */
const createGuest = (wid: string, body: Record<string, unknown>) =>
  saveGuest(wid, createGuestSchema.parse(body));

const params = (qs: string) => new URLSearchParams(qs);

describe("guest filters in the address bar", () => {
  it("reads filters and the page, and ignores junk", () => {
    const id = "a".repeat(24);
    expect(parseGuestFilters(params(`q=rao&event=${id}&household=Rao%20family&page=3`))).toEqual({
      q: "rao",
      eventId: id,
      household: "Rao family",
      page: 3,
    });
    expect(parseGuestFilters(params(""))).toEqual({ q: "", page: 1 });
    for (const bad of ["0", "-2", "1.5", "abc", "99999"]) {
      expect(parseGuestFilters(params(`page=${bad}`)).page, bad).toBe(1);
    }
    // An event that is not an id is dropped, not sent to the API.
    expect(parseGuestFilters(params("event=not-an-id")).eventId).toBeUndefined();
    expect(parseGuestFilters(params(`q=${"x".repeat(300)}`)).q).toHaveLength(100);
  });

  it("writes only what is not a default, and round-trips", () => {
    expect(guestFiltersToQuery(NO_FILTERS)).toBe("");
    expect(guestFiltersToQuery({ q: "  ", page: 1 })).toBe("");
    const id = "b".repeat(24);
    const filters = { q: "meena", eventId: id, household: "Reddy family", page: 2 };
    const qs = guestFiltersToQuery(filters);
    expect(qs).toBe(`q=meena&event=${id}&household=Reddy+family&page=2`);
    expect(parseGuestFilters(params(qs))).toEqual(filters);
  });

  it("says whether anything narrows the list (the page number does not)", () => {
    expect(hasActiveGuestFilters({ q: "", page: 4 })).toBe(false);
    expect(hasActiveGuestFilters({ q: " ", page: 1 })).toBe(false);
    expect(hasActiveGuestFilters({ q: "a", page: 1 })).toBe(true);
    expect(hasActiveGuestFilters({ q: "", household: "X", page: 1 })).toBe(true);
  });

  it("builds the API query with the page size and the cursor", () => {
    const qs = new URLSearchParams(
      listQuery({ q: "rao", eventId: "c".repeat(24), page: 2 }, "CURSOR"),
    );
    expect(qs.get("limit")).toBe("25");
    expect(qs.get("q")).toBe("rao");
    expect(qs.get("eventId")).toBe("c".repeat(24));
    expect(qs.get("cursor")).toBe("CURSOR");
    expect(new URLSearchParams(listQuery(NO_FILTERS)).has("cursor")).toBe(false);
  });
});

describe("table cell helpers", () => {
  it("shows two event chips and counts the rest", () => {
    expect(eventChips([])).toEqual({ shown: [], more: 0 });
    expect(eventChips(["Haldi"])).toEqual({ shown: ["Haldi"], more: 0 });
    expect(eventChips(["Haldi", "Mehendi"])).toEqual({ shown: ["Haldi", "Mehendi"], more: 0 });
    expect(eventChips(["Haldi", "Mehendi", "Muhurtham"])).toEqual({
      shown: ["Haldi", "Mehendi"],
      more: 1,
    });
    expect(eventChips(["a", "b", "c", "d", "e"]).more).toBe(3);
  });

  it("names a guest's events in the events' own order", () => {
    const events = [
      { id: "1", name: "Haldi" },
      { id: "2", name: "Mehendi" },
      { id: "3", name: "Reception" },
    ];
    expect(guestEventNames(["3", "1", "gone"], events)).toEqual(["Haldi", "Reception"]);
    expect(guestEventNames([], events)).toEqual([]);
  });

  it("words the delete impact line", () => {
    expect(deleteImpactLine(["Haldi", "Mehendi", "Muhurtham"])).toBe(
      "Invited to 3 events (Haldi, Mehendi, Muhurtham).",
    );
    expect(deleteImpactLine(["Haldi"])).toBe("Invited to 1 event (Haldi).");
    expect(deleteImpactLine([])).toBe("Not invited to any events yet.");
  });

  it("words the range under the list", () => {
    expect(showingText(1, 25, 25, 412)).toBe("Showing 1–25 of 412");
    expect(showingText(17, 25, 12, 412)).toBe("Showing 401–412 of 412");
    expect(showingText(1, 25, 0, 0)).toBe("Showing 0 of 0");
  });
});

describe("walking to a page with keyset cursors", () => {
  /** A fake list of `n` guests served 25 at a time, the way the API pages. */
  function fakeApi(n: number): { fetchPage: FetchPage; calls: (string | undefined)[] } {
    const calls: (string | undefined)[] = [];
    const fetchPage: FetchPage = async (cursor) => {
      calls.push(cursor);
      const start = cursor ? Number(cursor) : 0;
      const items = Array.from({ length: Math.max(0, Math.min(25, n - start)) }, (_, i) => ({
        id: String(start + i),
        name: `G${start + i}`,
        eventIds: [],
        inviteStatus: "not_sent" as const,
        rsvp: { replied: 0, of: 0 },
        reminderCount: 0,
        answers: [],
      }));
      return { items, total: n, ...(start + 25 < n ? { nextCursor: String(start + 25) } : {}) };
    };
    return { fetchPage, calls };
  }

  it("reaches a page by following cursors and remembers them", async () => {
    const { fetchPage, calls } = fakeApi(80);
    const reached = await walkToPage(fetchPage, 3);
    expect(calls).toEqual([undefined, "25", "50"]);
    expect(reached?.page).toBe(3);
    expect(reached?.list.items[0]?.id).toBe("50");
    expect(reached?.cursors).toEqual([undefined, "25", "50", "75"]);
  });

  it("stops at the last page when asked for one past the end", async () => {
    const { fetchPage } = fakeApi(30);
    const reached = await walkToPage(fetchPage, 9);
    expect(reached?.page).toBe(2);
    expect(reached?.list.items).toHaveLength(5);
  });

  it("gives up when a page cannot be fetched", async () => {
    const failing: FetchPage = async () => undefined;
    expect(await walkToPage(failing, 2)).toBeUndefined();
  });
});

describe("import review mapping", () => {
  const row = (over: Partial<ImportRow>): ImportRow => ({
    row: 2,
    data: { name: "Sita" },
    errors: {},
    ...over,
  });

  it("maps a row to ready, needs fixing or duplicate (errors win)", () => {
    expect(importRowStatus(row({}))).toBe("ready");
    expect(importRowStatus(row({ errors: { email: "Enter a valid email address." } }))).toBe(
      "needs_fixing",
    );
    expect(importRowStatus(row({ duplicate: { kind: "file", row: 2 } }))).toBe("duplicate");
    expect(
      importRowStatus(
        row({ errors: { name: "x" }, duplicate: { kind: "existing", guestId: "1", name: "A" } }),
      ),
    ).toBe("needs_fixing");
  });

  it("gives each row one message", () => {
    expect(importRowMessage(row({}))).toBeUndefined();
    expect(importRowMessage(row({ errors: { email: "Enter a valid email address." } }))).toBe(
      "Enter a valid email address.",
    );
    expect(importRowMessage(row({ duplicate: { kind: "file", row: 4 } }))).toBe(
      "Same email or phone as row 4",
    );
    expect(
      importRowMessage(row({ duplicate: { kind: "existing", guestId: "1", name: "Meena Reddy" } })),
    ).toContain("Meena Reddy");
  });

  it("counts so that the three cards add up to all rows", () => {
    const rows = [
      row({ row: 2 }),
      row({ row: 3 }),
      row({ row: 4, errors: { name: "Enter the guest's name." } }),
      row({ row: 5, duplicate: { kind: "file", row: 2 } }),
    ];
    const preview = { rows, total: 4, valid: 3, invalid: 1, duplicates: 1 };
    expect(importCounts(preview, true)).toEqual({
      all: 4,
      ready: 2,
      needsFixing: 1,
      duplicates: 1,
      importable: 2,
    });
    expect(importCounts(preview, false).importable).toBe(3);
    expect(filterImportRows(rows, "needs_fixing").map((r) => r.row)).toEqual([4]);
    expect(filterImportRows(rows, "duplicate").map((r) => r.row)).toEqual([5]);
    expect(filterImportRows(rows, "all")).toHaveLength(4);
  });

  it("sends only valid rows to the commit step, without the events text", () => {
    const sent = rowsToCommit([
      row({ data: { name: "Sita", email: "s@example.com", events: "Haldi", eventIds: ["e1"] } }),
      row({ row: 3, data: { name: "Bad" }, errors: { email: "x" } }),
      row({ row: 4, data: {} }),
    ]);
    expect(sent).toEqual([{ name: "Sita", email: "s@example.com", eventIds: ["e1"] }]);
  });

  it("says which rows were skipped and why", () => {
    expect(skippedLine(0, 0)).toBeUndefined();
    expect(skippedLine(1, 0)).toBe("1 row was skipped: 1 needs fixing.");
    expect(skippedLine(3, 1)).toBe("4 rows were skipped: 3 need fixing, 1 duplicate.");
    expect(skippedLine(0, 2)).toBe("2 rows were skipped: 2 duplicates.");
  });
});

describe("the sample file", () => {
  const csvPath = join(process.cwd(), "tests/fixtures/guests-sample.csv");

  async function wedding() {
    const { weddingId, user } = await createMember("admin");
    for (const [i, name] of ["Haldi", "Muhurtham", "Reception"].entries()) {
      await Event.create({
        weddingId,
        name,
        type: "Haldi",
        date: `2027-02-1${i + 1}`,
        time: "10:00",
        venueName: "Hall",
      });
    }
    return { wid: String(weddingId), userId: String(user._id) };
  }

  /** The same rows as an Excel file, built from the CSV. */
  async function xlsxCopy() {
    const rows = Papa.parse<string[]>(readFileSync(csvPath, "utf8").trim(), {
      skipEmptyLines: true,
    }).data;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Guests");
    for (const r of rows) ws.addRow(r);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  async function check(file: { name: string; bytes: Uint8Array }) {
    const { wid } = await wedding();
    const preview = await previewImport(wid, file);
    expect(importCounts(preview, true)).toMatchObject({
      all: 7,
      ready: 3,
      needsFixing: 3,
      duplicates: 1,
      importable: 3,
    });
    const byRow = Object.fromEntries(preview.rows.map((r) => [r.row, r]));
    expect(importRowStatus(byRow[5]!)).toBe("needs_fixing"); // missing name
    expect(byRow[5]!.errors.name).toBeTruthy();
    expect(byRow[6]!.errors.email).toBeTruthy(); // bad email
    expect(byRow[7]!.errors.events).toContain("Sangeet Night"); // unknown event
    expect(byRow[8]!.duplicate).toEqual({ kind: "file", row: 2 }); // same email as row 2
    expect(byRow[2]!.data.eventIds).toHaveLength(2);
    // Nothing is saved by the preview.
    expect(await Guest.countDocuments({ weddingId: wid })).toBe(0);

    const result = await commitImport(wid, {
      rows: rowsToCommit(preview.rows),
      onDuplicate: "skip",
    });
    expect(result).toEqual({ created: 3, skipped: 1, invalid: 0 });
    expect(await Guest.countDocuments({ weddingId: wid })).toBe(3);
    expect(skippedLine(3 + result.invalid, result.skipped)).toBe(
      "4 rows were skipped: 3 need fixing, 1 duplicate.",
    );
    return wid;
  }

  it("previews and imports the CSV", async () => {
    await check({ name: "guests-sample.csv", bytes: readFileSync(csvPath) });
  });

  it("gives the same answers for an Excel copy", async () => {
    await check({ name: "guests-sample.xlsx", bytes: await xlsxCopy() });
  });

  it("imports the duplicate too when the member chooses to", async () => {
    const { wid } = await wedding();
    const preview = await previewImport(wid, {
      name: "guests-sample.csv",
      bytes: readFileSync(csvPath),
    });
    const result = await commitImport(wid, {
      rows: rowsToCommit(preview.rows),
      onDuplicate: "add",
    });
    expect(result).toEqual({ created: 4, skipped: 0, invalid: 0 });
  });
});

describe("guest summary and the duplicate tag", () => {
  async function setup() {
    const { user, weddingId } = await createMember("admin");
    const ev = await Event.create({
      weddingId,
      name: "Haldi",
      type: "Haldi",
      date: "2027-02-11",
      time: "10:00",
      venueName: "Hall",
    });
    return { userId: String(user._id), wid: String(weddingId), eventId: String(ev._id) };
  }

  it("counts guests, households, invited and not yet assigned for the whole wedding", async () => {
    const { wid, eventId } = await setup();
    expect(await guestSummary(wid)).toEqual({
      total: 0,
      households: 0,
      invited: 0,
      unassigned: 0,
    });
    await createGuest(wid, { name: "A", household: "Rao family", eventIds: [eventId] });
    await createGuest(wid, { name: "B", household: "Rao family", eventIds: [eventId] });
    await createGuest(wid, { name: "C", household: "Naidu family" });
    await createGuest(wid, { name: "D" });
    expect(await guestSummary(wid)).toEqual({
      total: 4,
      households: 2,
      invited: 2,
      unassigned: 2,
    });
    // Another wedding's guests are not counted.
    const other = await createMember("admin");
    await createGuest(String(other.weddingId), { name: "Elsewhere", household: "Else" });
    expect((await guestSummary(wid)).total).toBe(4);
  });

  it("serves the summary to any member and refuses everyone else", async () => {
    const { userId, wid } = await setup();
    await createGuest(wid, { name: "A" });
    const ctx = { params: Promise.resolve({}) } as never;
    const ok = await summaryRoute(await request("/api/guests/summary", { userId }), ctx);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ total: 1, unassigned: 1 });
    const manager = await createMember("manager", undefined, new Types.ObjectId(wid));
    expect(
      (
        await summaryRoute(
          await request("/api/guests/summary", { userId: String(manager.user._id) }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect((await summaryRoute(await request("/api/guests/summary"), ctx)).status).toBe(401);
  });

  it("flags list rows that share an email or phone with another guest", async () => {
    const { userId, wid } = await setup();
    await createGuest(wid, { name: "Meena", email: "m@example.com", phone: "98490 12345" });
    await createGuest(wid, {
      name: "Meena R",
      email: "m@example.com",
      confirmDuplicates: true,
    });
    await createGuest(wid, {
      name: "Phone twin",
      phone: "+91 98490 12345",
      confirmDuplicates: true,
    });
    await createGuest(wid, { name: "Solo", email: "solo@example.com" });
    const ctx = { params: Promise.resolve({}) } as never;
    const res = await listRoute(await request("/api/guests", { userId }), ctx);
    const { items } = (await res.json()) as GuestList;
    const flagged = Object.fromEntries(items.map((g) => [g.name, g.duplicate === true]));
    expect(flagged).toEqual({ Meena: true, "Meena R": true, "Phone twin": true, Solo: false });
  });
});

describe("wording", () => {
  it("uses no gendered pronouns or sides in the guest screens", () => {
    const root = join(process.cwd(), "components/guests");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else if (entry.name.endsWith(".tsx")) files.push(join(dir, entry.name));
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\b(he|she|his|her|hers|him)\b/i);
      expect(text, file).not.toMatch(/\((bride|groom)\)/i);
    }
  });
});

describe("review fixes for the Guests page", () => {
  it("pages through guests with long non-Latin names: the cursor passes the API's own check", async () => {
    const { weddingId } = await createMember("admin");
    const wid = String(weddingId);
    // 100 Telugu letters is 300 bytes in the cursor before base64.
    const longName = (n: number) =>
      String.fromCharCode(0x0c05 + (n % 20)).repeat(98) + String(n % 10);
    for (let i = 0; i < 4; i++)
      await createGuest(wid, { name: longName(i) + String.fromCharCode(0x0c15 + i) });
    const first = await listGuests(wid, listGuestsQuery.parse({ limit: 2 }));
    expect(first.nextCursor).toBeDefined();
    expect(first.nextCursor!.length).toBeGreaterThan(300);
    // The cursor must be accepted by the same schema the route uses.
    const next = listGuestsQuery.parse({ limit: 2, cursor: first.nextCursor });
    const second = await listGuests(wid, next);
    expect(second.items).toHaveLength(2);
    expect(second.items.map((g) => g.id)).not.toContain(first.items[0]!.id);
  });

  it("walks past pages without totals or duplicate tags, and answers fully on the page it stops at", async () => {
    const { weddingId } = await createMember("admin");
    const wid = String(weddingId);
    for (let i = 1; i <= 5; i++)
      await createGuest(wid, { name: `G${i}`, email: `g${i}@example.com` });
    await createGuest(wid, { name: "G6", email: "g1@example.com", confirmDuplicates: true });
    const light = await listGuests(wid, listGuestsQuery.parse({ limit: 2 }), { light: true });
    expect(light.total).toBe(0);
    expect(light.items.every((g) => !g.duplicate)).toBe(true);
    expect(light.nextCursor).toBeDefined();
    const full = await listGuests(wid, listGuestsQuery.parse({ limit: 2 }));
    expect(full.total).toBe(6);
    expect(full.items.some((g) => g.duplicate)).toBe(true);
  });

  it("the summary survives a guest saved without an eventIds array", async () => {
    const { weddingId } = await createMember("admin");
    await Guest.collection.insertOne({
      weddingId,
      name: "Scripted",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await guestSummary(String(weddingId))).toMatchObject({
      total: 1,
      invited: 0,
      unassigned: 1,
    });
  });
});
