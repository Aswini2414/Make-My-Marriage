// Spreadsheet safety. No server-only imports: pure text handling.
//
// Excel, Sheets and LibreOffice treat a cell that starts with =, +, - or @ as a formula, and a
// leading tab or carriage return can hide one. Guest data comes from people and files we don't
// control, so it is stored exactly as given and NEVER evaluated, and every EXPORT (guest
// export, Money exports) must pass text cells through `safeCell` first.

const FORMULA_START = /^[=+\-@\t\r]/;

/** Text that is safe to write into a CSV or XLSX cell: a leading ' stops it running as a formula. */
export function safeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}
