import type { GuestList, ImportPreview, ImportRow } from "./types";

// Helpers for the Guests page and the import wizard. Browser-safe: no server-only imports, so
// the page and the tests share them.

export const PAGE_SIZE = 25;

/** The import limits, as the server enforces them (shown on the upload step). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

// ---- filters in the address bar ----

export type GuestFilters = {
  /** Search text (name, phone or email). */
  q: string;
  eventId?: string;
  household?: string;
  /** 1-based. */
  page: number;
};

export const NO_FILTERS: GuestFilters = { q: "", page: 1 };

type Params = { get(name: string): string | null };

/** The page's filters from the address bar. Unknown or broken values are ignored. */
export function parseGuestFilters(params: Params): GuestFilters {
  const page = Number(params.get("page"));
  const event = params.get("event");
  const household = params.get("household")?.trim();
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    ...(event && /^[0-9a-f]{24}$/i.test(event) ? { eventId: event } : {}),
    ...(household ? { household: household.slice(0, 80) } : {}),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** The address-bar form of the filters; defaults are left out. */
export function guestFiltersToQuery(filters: GuestFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.eventId) params.set("event", filters.eventId);
  if (filters.household) params.set("household", filters.household);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

/** Whether anything narrows the list. The page number alone does not count. */
export function hasActiveGuestFilters(filters: GuestFilters): boolean {
  return !!filters.q.trim() || !!filters.eventId || !!filters.household;
}

/** The query string for GET /api/guests. */
export function listQuery(filters: GuestFilters, cursor?: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.household) params.set("household", filters.household);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

// ---- paging with keyset cursors ----

/** Fetches one page: the page after `cursor`, or the first page when there is none. */
export type FetchPage = (cursor?: string) => Promise<GuestList | undefined>;

export type PageResult = {
  list: GuestList;
  /** `cursors[n]` is what fetches page n + 1; `cursors[0]` is undefined (the first page). */
  cursors: (string | undefined)[];
  /** The page actually reached, which is lower than asked when the list is shorter. */
  page: number;
};

/**
 * Reaches page `page` by following the list's cursors one page at a time. The API pages by
 * keyset (the last guest's position), so a page number cannot be jumped to. Stops at the last
 * page when the list is shorter than asked. Returns undefined if a fetch fails.
 */
export async function walkToPage(
  fetchPage: FetchPage,
  page: number,
): Promise<PageResult | undefined> {
  const cursors: (string | undefined)[] = [undefined];
  let cursor: string | undefined;
  let list: GuestList | undefined;
  let reached = 0;
  for (let at = 1; at <= page; at++) {
    if (at > 1 && !cursor) break;
    const next = await fetchPage(cursor);
    if (!next) return undefined;
    list = next;
    reached = at;
    cursor = next.nextCursor;
    if (cursor) cursors[at] = cursor;
  }
  return list ? { list, cursors, page: reached } : undefined;
}

/** "Showing 1–25 of 412". An empty list says "Showing 0 of 0". */
export function showingText(page: number, size: number, count: number, total: number): string {
  if (total === 0 || count === 0) return `Showing 0 of ${total}`;
  const from = (page - 1) * size + 1;
  return `Showing ${from}–${from + count - 1} of ${total}`;
}

// ---- table cells ----

/** The event names on a row: the first `max` as chips and how many more there are. */
export function eventChips(names: string[], max = 2): { shown: string[]; more: number } {
  return { shown: names.slice(0, max), more: Math.max(0, names.length - max) };
}

/** Names of the events a guest is invited to, in the order the events are listed. */
export function guestEventNames(eventIds: string[], events: { id: string; name: string }[]) {
  const invited = new Set(eventIds);
  return events.filter((e) => invited.has(e.id)).map((e) => e.name);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "Invited to 3 events (Haldi, Mehendi, Muhurtham). Their 2 RSVPs will be deleted." for the
 * delete confirmation. `rsvps` is how many answers the guest has given.
 */
export function deleteImpactLine(names: string[], rsvps = 0): string {
  const invited =
    names.length === 0
      ? "Not invited to any events yet."
      : `Invited to ${plural(names.length, "event")} (${names.join(", ")}).`;
  if (rsvps === 0) return invited;
  return `${invited} Their ${rsvps === 1 ? "RSVP" : `${rsvps} RSVPs`} will be deleted too.`;
}

// ---- import review ----

export type RowStatus = "ready" | "needs_fixing" | "duplicate";
export type ImportTab = "all" | "needs_fixing" | "duplicate";

export const IMPORT_TABS: readonly ImportTab[] = ["all", "needs_fixing", "duplicate"];

export function importRowStatus(row: ImportRow): RowStatus {
  if (Object.keys(row.errors).length > 0) return "needs_fixing";
  return row.duplicate ? "duplicate" : "ready";
}

/** The one line shown under a row: its problem, or why it is a possible duplicate. */
export function importRowMessage(row: ImportRow): string | undefined {
  const first = Object.values(row.errors)[0];
  if (first) return first;
  if (!row.duplicate) return undefined;
  return row.duplicate.kind === "existing"
    ? `Same email or phone as ${row.duplicate.name}, already on your list`
    : `Same email or phone as row ${row.duplicate.row}`;
}

export function filterImportRows(rows: ImportRow[], tab: ImportTab): ImportRow[] {
  return tab === "all" ? rows : rows.filter((r) => importRowStatus(r) === tab);
}

/**
 * The review numbers. A possible duplicate is a valid row, but it is counted on its own so the
 * three cards add up to all rows. `importable` is what the button imports.
 */
export function importCounts(preview: ImportPreview, skipDuplicates: boolean) {
  const duplicates = preview.rows.filter((r) => importRowStatus(r) === "duplicate").length;
  const ready = preview.rows.filter((r) => importRowStatus(r) === "ready").length;
  return {
    all: preview.rows.length,
    ready,
    needsFixing: preview.rows.length - ready - duplicates,
    duplicates,
    importable: skipDuplicates ? ready : ready + duplicates,
  };
}

/** The rows the commit step is sent: only those the preview found valid. */
export function rowsToCommit(rows: ImportRow[]) {
  return rows
    .filter((r) => Object.keys(r.errors).length === 0 && r.data.name)
    .map((r) => ({
      name: r.data.name!,
      ...(r.data.email ? { email: r.data.email } : {}),
      ...(r.data.phone ? { phone: r.data.phone } : {}),
      ...(r.data.relation ? { relation: r.data.relation } : {}),
      ...(r.data.household ? { household: r.data.household } : {}),
      ...(r.data.eventIds?.length ? { eventIds: r.data.eventIds } : {}),
    }));
}

/** "3 rows were skipped: 2 need fixing, 1 duplicate." Undefined when nothing was skipped. */
export function skippedLine(needFixing: number, duplicates: number): string | undefined {
  const parts = [
    needFixing > 0 && `${needFixing} ${needFixing === 1 ? "needs" : "need"} fixing`,
    duplicates > 0 && plural(duplicates, "duplicate"),
  ].filter(Boolean);
  if (parts.length === 0) return undefined;
  const n = needFixing + duplicates;
  return `${plural(n, "row")} ${n === 1 ? "was" : "were"} skipped: ${parts.join(", ")}.`;
}
