"use client";

import { useRef, useState } from "react";
import { FormBanner } from "@/components/form/FormBanner";
import { CloudUploadOutlineIcon, DownloadOutlineIcon } from "@/components/icons";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/modules/guests/format";

type Props = {
  /** Called with a file that passed the quick checks. */
  onFile: (file: File) => void;
  busy: boolean;
  /** A problem from the server, such as a rejected file. */
  error?: string;
  /** The wedding's first event names, for the example row. */
  exampleEvents: string[];
};

const COLUMNS = ["Name", "Email", "Phone", "Relation", "Household", "Events"];

/** The quick checks the browser can do; the server still decides by the file's contents. */
export function checkFile(file: File): string | undefined {
  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    return /\.xls$/i.test(file.name)
      ? "That is an old Excel file (.xls). Open it and save it as .xlsx or .csv, then upload it again."
      : "Choose a .csv or .xlsx file. Use the template below if you are not sure.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > IMPORT_MAX_BYTES) return "That file is over 2 MB. Split it into smaller files.";
  return undefined;
}

/** Step 1: a drop zone and file picker, the template links and the columns. */
export function UploadStep({ onFile, busy, error, exampleEvents }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string>();

  function take(file: File | undefined) {
    if (!file || busy) return;
    const bad = checkFile(file);
    setProblem(bad);
    if (!bad) onFile(file);
  }

  const shown = problem ?? error;
  const eventsExample = (exampleEvents.length > 0 ? exampleEvents : ["Haldi", "Muhurtham"])
    .slice(0, 2)
    .join("; ");
  const example = [
    "Meena Reddy",
    "meena.reddy@example.com",
    "+91 98490 12345",
    "Cousin",
    "Reddy family",
    eventsExample,
  ];

  return (
    <div className="flex flex-col gap-6">
      {shown && <FormBanner>{shown}</FormBanner>}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center rounded-card border-2 border-dashed px-4 py-10 text-center transition-colors sm:py-14 ${
          dragging ? "border-plum bg-lilac" : "border-mauve bg-ivory"
        }`}
      >
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-lilac text-plum">
          <CloudUploadOutlineIcon className="size-8" />
        </div>
        <p className="font-display text-xl text-plum sm:text-2xl">
          Drop a CSV or Excel file here, or{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="underline underline-offset-4 disabled:opacity-60"
          >
            choose a file
          </button>
        </p>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a CSV or Excel file"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-sm text-ink-body">
          Up to {IMPORT_MAX_ROWS.toLocaleString("en-IN")} rows and 2 MB. Use our template so the
          columns match.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-medium text-plum">
          {/* A file download, not a page: a plain link, not next/link. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/guests/import/template?format=csv"
            className="flex min-h-11 items-center gap-2 hover:underline"
          >
            <DownloadOutlineIcon className="size-4" />
            Download CSV template
          </a>
          <span aria-hidden="true" className="hidden size-1 rounded-full bg-champagne sm:block" />
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/guests/import/template?format=xlsx"
            className="flex min-h-11 items-center gap-2 hover:underline"
          >
            <DownloadOutlineIcon className="size-4" />
            Download Excel template
          </a>
        </div>
        {busy && (
          <div role="status" className="mt-4 w-full max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-lilac">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-plum" />
            </div>
            <p className="mt-2 text-xs text-ink-secondary">Checking your file…</p>
          </div>
        )}
      </div>

      <section aria-labelledby="template-columns">
        <h2
          id="template-columns"
          className="mb-3 text-[11px] font-semibold tracking-wider text-ink-secondary uppercase"
        >
          Template columns
        </h2>
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-ivory text-xs font-semibold text-ink-body">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c} className="px-4 py-3">
                    {c}
                    {c === "Name" && <span className="sr-only"> (required)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border text-ink">
                {example.map((cell, i) => (
                  <td key={i} className="px-4 py-3.5 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
          Only the name is required. In the Events column, separate event names with a semicolon,
          like the example.
        </p>
      </section>
    </div>
  );
}
