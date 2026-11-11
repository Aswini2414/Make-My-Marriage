import "server-only";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { ApiError } from "@/lib/errors";

// Reads an uploaded guest file into a plain table of text. The file is held in memory only and
// is never stored. Nothing in it is evaluated: cells are read as text, formulas included.

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
/** What an .xlsx may unpack to. A real guest list is a few hundred KB. */
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;
const MAX_COLUMNS = 30;

/** `line` is the row number as the member sees it in the spreadsheet (the header is row 1). */
export type TableRow = { line: number; cells: string[] };
export type Table = { headers: string[]; rows: TableRow[] };

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
// Old Excel (.xls), Word and similar Office files.
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46];

const notAllowed = (message?: string) => new ApiError("FILE_TYPE_NOT_ALLOWED", message);
const invalid = (message?: string) => new ApiError("IMPORT_FILE_INVALID", message);

const OLD_EXCEL_MESSAGE =
  "That is an old Excel (.xls) file. In Excel choose Save As and pick Excel Workbook (.xlsx) or CSV, then upload that.";
const UNICODE_TEXT_MESSAGE =
  'That file is saved as "Unicode Text" or UTF-16. In Excel choose Save As and pick CSV UTF-8 or Excel Workbook (.xlsx).';

type Kind = "csv" | "xlsx";

/**
 * Decides what the file is from its name AND its first bytes. The extension alone is never
 * trusted: a renamed zip, program, image or old .xls is refused.
 */
export function detectKind(name: string, bytes: Uint8Array): Kind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    if (startsWith(bytes, OLE)) throw notAllowed(OLD_EXCEL_MESSAGE);
    if (!startsWith(bytes, ZIP)) throw notAllowed();
    return "xlsx";
  }
  if (lower.endsWith(".csv")) {
    // Text only: no binary signatures and no NUL bytes anywhere (this also rules out UTF-16).
    if (startsWith(bytes, OLE)) throw notAllowed(OLD_EXCEL_MESSAGE);
    if (startsWith(bytes, ZIP) || startsWith(bytes, PDF)) throw notAllowed();
    if (bytes.includes(0)) throw notAllowed(UNICODE_TEXT_MESSAGE);
    return "csv";
  }
  if (lower.endsWith(".xls")) throw notAllowed(OLD_EXCEL_MESSAGE);
  throw notAllowed();
}

/**
 * An .xlsx is a zip. Refuses a file that would unpack to far more than it weighs (a "zip bomb")
 * before the spreadsheet library ever opens it.
 *
 * The sizes a zip DECLARES are written by whoever made the file, so they are only a first filter.
 * The real check unpacks every entry here, with a hard output cap shared by all entries, so a
 * file that lies about its sizes is stopped after at most MAX_UNPACKED_BYTES of work.
 */
export function assertSafeZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-directory record sits in the last 22 bytes plus an optional comment.
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw invalid();
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  // 0xFFFF / 0xFFFFFFFF mean zip64, which a small guest list never needs.
  if (entries === 0xffff || offset === 0xffffffff || entries > MAX_ZIP_ENTRIES) throw invalid();

  const tooBig = () => invalid("That file is too large once opened.");
  let declared = 0;
  let budget = MAX_UNPACKED_BYTES; // what may still be unpacked, counted from the real data
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw invalid();
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    declared += view.getUint32(offset + 24, true);
    if (declared > MAX_UNPACKED_BYTES) throw tooBig();
    const local = view.getUint32(offset + 42, true);
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);

    // The entry's data, found through its local header, then really unpacked under the cap.
    if (local + 30 > bytes.byteLength || view.getUint32(local, true) !== 0x04034b50)
      throw invalid();
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const end = start + compressedSize;
    if (end > bytes.byteLength) throw invalid();
    const data = bytes.subarray(start, end);
    if (data.byteLength === 0) {
      continue; // an empty placeholder entry (some writers emit these): nothing to unpack
    } else if (method === 0) {
      budget -= data.byteLength; // stored: it is what it weighs
    } else if (method === 8) {
      try {
        budget -= inflateRawSync(data, { maxOutputLength: Math.max(budget, 1) }).byteLength;
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw tooBig();
        throw invalid();
      }
    } else {
      throw invalid();
    }
    if (budget < 0) throw tooBig();
  }
}

function tooManyRows() {
  return invalid(`Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} guests at a time.`);
}

function readCsv(bytes: Uint8Array): Table {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    // Excel's plain "CSV (Comma delimited)" on Windows is Windows-1252, not UTF-8: accents and
    // curly quotes would otherwise be refused. Every byte sequence is valid in it.
    // A UTF-8 BOM (EF BB BF) would read as three odd letters here, so leave it out.
    const hasBom = startsWith(bytes, [0xef, 0xbb, 0xbf]);
    text = new TextDecoder("windows-1252").decode(hasBom ? bytes.subarray(3) : bytes);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Text only: control characters mean this is some other kind of file.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) throw notAllowed();

  // Excel in many regions separates columns with ";". Only the header line decides, because ";"
  // also separates event names inside the events cell of a comma file.
  const headerLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const semicolonFile = !/[,\t]/.test(headerLine) && headerLine.includes(";");
  const parsed = Papa.parse<string[]>(text, {
    ...(semicolonFile ? { delimiter: ";" } : { delimitersToGuess: [",", "\t"] }),
  });
  if (parsed.errors.some((e) => e.type === "Quotes")) throw invalid();
  const lines = parsed.data
    .map((cells, i) => ({ line: i + 1, cells: cells.map((c) => c.trim()) }))
    .filter((r) => r.cells.some((c) => c !== ""));
  const [header, ...rows] = lines;
  if (!header) throw invalid("That file is empty.");
  if (rows.length > MAX_IMPORT_ROWS) throw tooManyRows();
  return { headers: header.cells, rows };
}

async function readXlsx(bytes: Uint8Array): Promise<Table> {
  assertSafeZip(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw invalid();
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw invalid("That file has no sheets.");
  if (sheet.actualRowCount > MAX_IMPORT_ROWS + 1) throw tooManyRows();

  const columns = Math.min(sheet.columnCount, MAX_COLUMNS);
  const lines: TableRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, line) => {
    const cells: string[] = [];
    // `.text` is the cell as shown. A formula gives the result Excel saved with it; nothing is
    // calculated here.
    for (let c = 1; c <= columns; c++) cells.push(row.getCell(c).text.trim());
    if (cells.some((cell) => cell !== "")) lines.push({ line, cells });
  });
  const [header, ...rows] = lines;
  if (!header) throw invalid("That file is empty.");
  if (rows.length > MAX_IMPORT_ROWS) throw tooManyRows();
  return { headers: header.cells, rows };
}

/** Reads the upload into a table. The first line is the header; blank lines are dropped. */
export async function readImportFile(name: string, bytes: Uint8Array): Promise<Table> {
  const kind = detectKind(name, bytes);
  return kind === "xlsx" ? readXlsx(bytes) : readCsv(bytes);
}
