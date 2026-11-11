import "server-only";
import type { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, zodToFields } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Event } from "@/modules/events/model";
import { Guest } from "./model";
import { readImportFile } from "./import-file";
import { guestDetailsSchema, IMPORT_COLUMNS, importRowSchema } from "./schema";
import { insertGuests } from "./service";
import type { ImportPreview, ImportResult, ImportRow, ImportRowDuplicate } from "./types";

// Guest import in two steps (docs/api-design.md, "Import"): `previewImport` checks a file and
// saves nothing; `commitImport` saves the valid rows the page sends back, checking every one
// again, because the page is not trusted.

/** How much of a bad cell is sent back, so one huge cell cannot bloat the answer. */
const ECHO_LIMIT = 200;
const clip = (text: string) => (text.length > ECHO_LIMIT ? `${text.slice(0, ECHO_LIMIT)}…` : text);

const norm = (text: string) => text.normalize("NFC").trim().toLowerCase();

type EventLookup = { byName: Map<string, string>; ids: Set<string> };

/** This wedding's events: id by lower-cased name (the first one in date order wins), and all ids. */
async function loadEvents(wid: Types.ObjectId): Promise<EventLookup> {
  const events = await Event.find({ weddingId: wid })
    .select("name")
    .sort({ date: 1, time: 1, _id: 1 })
    .lean();
  const byName = new Map<string, string>();
  for (const e of events) {
    const key = norm(e.name);
    if (!byName.has(key)) byName.set(key, String(e._id));
  }
  return { byName, ids: new Set(events.map((e) => String(e._id))) };
}

type Contacts = {
  byEmail: Map<string, ImportRowDuplicate>;
  byPhone: Map<string, ImportRowDuplicate>;
};

/** Saved guests that share an email or phone with any of these. */
async function findExisting(
  wid: Types.ObjectId,
  emails: string[],
  phones: string[],
): Promise<Contacts> {
  const byEmail = new Map<string, ImportRowDuplicate>();
  const byPhone = new Map<string, ImportRowDuplicate>();
  const or: Record<string, unknown>[] = [];
  if (emails.length > 0) or.push({ email: { $in: emails } });
  if (phones.length > 0) or.push({ phone: { $in: phones } });
  if (or.length === 0) return { byEmail, byPhone };
  const found = await Guest.find({ weddingId: wid, $or: or })
    .select("name email phone")
    .sort({ _id: 1 })
    .lean();
  for (const g of found) {
    const match: ImportRowDuplicate = { kind: "existing", guestId: String(g._id), name: g.name };
    if (g.email && !byEmail.has(g.email)) byEmail.set(g.email, match);
    if (g.phone && !byPhone.has(g.phone)) byPhone.set(g.phone, match);
  }
  return { byEmail, byPhone };
}

/**
 * Marks rows that repeat a saved guest's email or phone, or an earlier row's. The first row of a
 * pair is not a duplicate; the later one is. Returns the same rows' duplicate info by index.
 */
function markDuplicates(
  rows: { line: number; email?: string; phone?: string }[],
  existing: Contacts,
): (ImportRowDuplicate | undefined)[] {
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  return rows.map((row) => {
    const found =
      (row.email && existing.byEmail.get(row.email)) ||
      (row.phone && existing.byPhone.get(row.phone)) ||
      undefined;
    const earlier =
      (row.email && seenEmail.get(row.email)) ||
      (row.phone && seenPhone.get(row.phone)) ||
      undefined;
    if (row.email && !seenEmail.has(row.email)) seenEmail.set(row.email, row.line);
    if (row.phone && !seenPhone.has(row.phone)) seenPhone.set(row.phone, row.line);
    if (found) return found;
    if (earlier) return { kind: "file" as const, row: earlier };
    return undefined;
  });
}

function unknownEventsMessage(names: string[]) {
  const quoted = names.slice(0, 3).map((n) => `"${clip(n).slice(0, 40)}"`);
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `No ${names.length === 1 ? "event" : "events"} called ${quoted.join(", ")}${more}.`;
}

export async function previewImport(
  weddingId: string,
  file: { name: string; bytes: Uint8Array },
): Promise<ImportPreview> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const table = await readImportFile(file.name, file.bytes);

  // Columns are found by header name (any order, any case). Other columns are ignored.
  const column = new Map<string, number>();
  table.headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !column.has(key)) column.set(key, i);
  });
  if (!column.has("name")) {
    throw new ApiError(
      "IMPORT_FILE_INVALID",
      'The first row must have a "name" column. Use the template.',
    );
  }
  const cell = (cells: string[], key: (typeof IMPORT_COLUMNS)[number]) => {
    const i = column.get(key);
    return i === undefined ? "" : (cells[i] ?? "");
  };

  const events = await loadEvents(wid);
  const parsed = table.rows.map(({ line, cells }) => {
    const raw = {
      name: cell(cells, "name"),
      email: cell(cells, "email"),
      phone: cell(cells, "phone"),
      relation: cell(cells, "relation"),
      household: cell(cells, "household"),
    };
    const eventsText = cell(cells, "events");
    const result = guestDetailsSchema.safeParse(raw);
    const errors: Record<string, string> = result.success ? {} : zodToFields(result.error);

    const names = eventsText
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean);
    const eventIds = new Set<string>();
    const unknown: string[] = [];
    for (const n of names) {
      const id = events.byName.get(norm(n));
      if (id) eventIds.add(id);
      else unknown.push(n);
    }
    if (unknown.length > 0) errors.events = unknownEventsMessage(unknown);

    const details = result.success ? result.data : undefined;
    const data: ImportRow["data"] = details
      ? {
          name: details.name,
          ...(details.email ? { email: details.email } : {}),
          ...(details.phone ? { phone: details.phone } : {}),
          ...(details.relation ? { relation: details.relation } : {}),
          ...(details.household ? { household: details.household } : {}),
        }
      : Object.fromEntries(
          Object.entries(raw)
            .filter(([, v]) => v !== "")
            .map(([k, v]) => [k, clip(v)]),
        );
    if (eventsText) data.events = clip(eventsText);
    if (unknown.length === 0 && eventIds.size > 0) data.eventIds = [...eventIds];
    return { line, data, errors, details };
  });

  // Duplicates only matter for rows that could be saved.
  const validRows = parsed.filter((r) => Object.keys(r.errors).length === 0);
  const existing = await findExisting(
    wid,
    [...new Set(validRows.map((r) => r.details?.email).filter((e): e is string => !!e))],
    [...new Set(validRows.map((r) => r.details?.phone).filter((p): p is string => !!p))],
  );
  const dupes = markDuplicates(
    validRows.map((r) => ({ line: r.line, email: r.details?.email, phone: r.details?.phone })),
    existing,
  );
  const dupeByLine = new Map(validRows.map((r, i) => [r.line, dupes[i]]));

  const rows: ImportRow[] = parsed.map((r) => {
    const duplicate = dupeByLine.get(r.line);
    return { row: r.line, data: r.data, errors: r.errors, ...(duplicate ? { duplicate } : {}) };
  });
  return {
    rows,
    total: rows.length,
    valid: validRows.length,
    invalid: rows.length - validRows.length,
    duplicates: rows.filter((r) => r.duplicate).length,
  };
}

/**
 * Saves the rows the page sends back. Each is validated again with the same schema, and its
 * events must be this wedding's; a row that fails is counted as invalid, not saved.
 * `skip` leaves out rows that repeat a saved guest or an earlier row; `add` saves them anyway.
 */
export async function commitImport(
  weddingId: string,
  input: { rows: unknown[]; onDuplicate: "skip" | "add" },
): Promise<ImportResult> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const events = await loadEvents(wid);

  const accepted: { line: number; details: ReturnType<typeof importRowSchema.parse> }[] = [];
  let invalid = 0;
  input.rows.forEach((row, i) => {
    const result = importRowSchema.safeParse(row);
    const ids = result.success ? (result.data.eventIds ?? []) : [];
    if (!result.success || ids.some((id) => !events.ids.has(id))) {
      invalid++;
      return;
    }
    accepted.push({ line: i + 1, details: result.data });
  });

  let skipped = 0;
  let toSave = accepted;
  if (input.onDuplicate === "skip") {
    const existing = await findExisting(
      wid,
      [...new Set(accepted.map((r) => r.details.email).filter((e): e is string => !!e))],
      [...new Set(accepted.map((r) => r.details.phone).filter((p): p is string => !!p))],
    );
    const dupes = markDuplicates(
      accepted.map((r) => ({ line: r.line, email: r.details.email, phone: r.details.phone })),
      existing,
    );
    toSave = accepted.filter((_, i) => !dupes[i]);
    skipped = accepted.length - toSave.length;
  }

  const created = await insertGuests(
    weddingId,
    toSave.map((r) => ({
      ...r.details,
      eventIds: (r.details.eventIds ?? []).map((id) => toObjectId(id)),
    })),
  );
  return { created, skipped, invalid };
}
