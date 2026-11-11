import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { connectDb } from "@/lib/db";
import { toObjectId } from "@/lib/ids";
import { safeCell } from "@/lib/spreadsheet";
import { Event } from "@/modules/events/model";
import { IMPORT_COLUMNS } from "./schema";

// The downloadable template: the six columns from docs/api-design.md and one example row. The
// example uses this wedding's own first events, so it imports as it stands.

export type TemplateFormat = "csv" | "xlsx";

export const TEMPLATE_TYPES: Record<TemplateFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function exampleRow(weddingId: string): Promise<string[]> {
  await connectDb();
  const events = await Event.find({ weddingId: toObjectId(weddingId) })
    .select("name")
    .sort({ date: 1, time: 1, _id: 1 })
    .limit(2)
    .lean();
  return [
    "Lakshmi Rao",
    "lakshmi@example.com",
    "98480 12345",
    "Mother's cousin",
    "Rao family, Vizag",
    events.map((e) => e.name).join("; "),
  ];
}

export async function buildTemplate(weddingId: string, format: TemplateFormat): Promise<Buffer> {
  // Every cell goes through safeCell, like every export.
  const rows = [[...IMPORT_COLUMNS], await exampleRow(weddingId)].map((r) => r.map(safeCell));

  if (format === "csv") {
    // The BOM makes Excel read the file as UTF-8, so Indian names keep their letters.
    return Buffer.from(`﻿${Papa.unparse(rows, { newline: "\r\n" })}\r\n`, "utf8");
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Guests");
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  // Text columns, so Excel does not turn a phone number into a number and drop its zero.
  sheet.columns = IMPORT_COLUMNS.map((key) => ({
    key,
    width: key === "events" || key === "email" ? 36 : 22,
    style: { numFmt: "@" },
  }));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
