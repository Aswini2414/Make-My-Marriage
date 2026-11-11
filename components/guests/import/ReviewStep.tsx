"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { CheckCircleIcon, DocumentDuplicateOutlineIcon, ErrorIcon } from "@/components/icons";
import {
  filterImportRows,
  IMPORT_TABS,
  type ImportTab,
  importCounts,
  importRowMessage,
  importRowStatus,
  type RowStatus,
} from "@/modules/guests/format";
import type { ImportPreview, ImportRow } from "@/modules/guests/types";

type Props = {
  fileName: string;
  preview: ImportPreview;
  skipDuplicates: boolean;
  onSkipDuplicates: (skip: boolean) => void;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onImport: () => void;
};

const SHOWN_AT_A_TIME = 200;

const TAB_LABEL: Record<ImportTab, string> = {
  all: "All",
  needs_fixing: "Needs fixing",
  duplicate: "Duplicates",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  ready: "Ready to import",
  needs_fixing: "Needs fixing",
  duplicate: "Possible duplicate",
};

function StatusIcon({ status }: { status: RowStatus }) {
  const cls = "size-5 shrink-0";
  return (
    <span role="img" aria-label={STATUS_LABEL[status]} className="inline-flex">
      {status === "ready" && <CheckCircleIcon className={`${cls} text-plum`} />}
      {status === "needs_fixing" && <ErrorIcon className={`${cls} text-error`} />}
      {status === "duplicate" && (
        <DocumentDuplicateOutlineIcon className={`${cls} text-champagne-deep`} />
      )}
    </span>
  );
}

/** One cell: the text, in the error colour with its message when that field is the problem. */
function Cell({ value, error }: { value?: string; error?: string }) {
  return (
    <>
      <span
        className={`block break-words ${error ? "text-error" : "text-ink"} ${value ? "" : "text-ink-secondary"}`}
      >
        {value || "–"}
      </span>
      {error && <span className="mt-0.5 block text-xs break-words text-error">{error}</span>}
    </>
  );
}

function rowTone(status: RowStatus) {
  return status === "needs_fixing"
    ? "bg-error-bg/50"
    : status === "duplicate"
      ? "bg-champagne-tint"
      : "";
}

/** Step 2: the numbers, the rows with their problems, and the Import button. */
export function ReviewStep({
  fileName,
  preview,
  skipDuplicates,
  onSkipDuplicates,
  busy,
  error,
  onBack,
  onImport,
}: Props) {
  const [tab, setTab] = useState<ImportTab>("all");
  const [limit, setLimit] = useState(SHOWN_AT_A_TIME);
  const counts = useMemo(() => importCounts(preview, skipDuplicates), [preview, skipDuplicates]);
  const rows = useMemo(() => filterImportRows(preview.rows, tab), [preview.rows, tab]);
  const tabCount: Record<ImportTab, number> = {
    all: counts.all,
    needs_fixing: counts.needsFixing,
    duplicate: counts.duplicates,
  };
  const visible = rows.slice(0, limit);

  /** The message for a row goes under the cell it is about; others go under the name. */
  const fieldError = (row: ImportRow, field: string) => row.errors[field];
  const nameNote = (row: ImportRow) =>
    row.errors.name ??
    row.errors.relation ??
    row.errors.household ??
    (importRowStatus(row) === "duplicate" ? importRowMessage(row) : undefined);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-secondary">
        File: <span className="font-medium break-all text-ink-body">{fileName}</span>
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-card border border-border bg-surface p-4 sm:p-5">
          <p className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-ink-secondary uppercase">
            Ready to import
            <CheckCircleIcon className="size-5 text-plum" />
          </p>
          <p className="mt-2 font-display text-3xl leading-none text-plum">{counts.ready}</p>
        </div>
        <div
          className={`rounded-card border p-4 sm:p-5 ${
            counts.needsFixing > 0 ? "border-error-border bg-error-bg" : "border-border bg-surface"
          }`}
        >
          <p
            className={`flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase ${
              counts.needsFixing > 0 ? "text-error" : "text-ink-secondary"
            }`}
          >
            Need fixing
            <ErrorIcon className="size-5" />
          </p>
          <p
            className={`mt-2 font-display text-3xl leading-none ${
              counts.needsFixing > 0 ? "text-error" : "text-plum"
            }`}
          >
            {counts.needsFixing}
          </p>
        </div>
        <div className="rounded-card border border-border bg-champagne-tint p-4 sm:p-5">
          <p className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-champagne-deep uppercase">
            Possible duplicates
            <DocumentDuplicateOutlineIcon className="size-5" />
          </p>
          <p className="mt-2 font-display text-3xl leading-none text-champagne-deep">
            {counts.duplicates}
          </p>
        </div>
      </div>

      <div
        role="group"
        aria-label="Which rows"
        className="flex flex-wrap gap-1 border-b border-border pb-3"
      >
        {IMPORT_TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setLimit(SHOWN_AT_A_TIME);
            }}
            className={`min-h-11 rounded-full px-4 text-xs font-medium whitespace-nowrap transition-colors sm:min-h-9 ${
              tab === t ? "bg-plum text-ivory" : "text-ink-body hover:text-plum"
            }`}
          >
            {TAB_LABEL[t]} ({tabCount[t]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card border border-border bg-ivory px-4 py-8 text-center text-sm text-ink-secondary">
          No rows here.
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-card border border-border md:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-16" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[28%]" />
                <col />
              </colgroup>
              <thead className="bg-ivory text-xs font-semibold text-ink-body">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-3 py-3">Guest</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Events specified</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const status = importRowStatus(row);
                  return (
                    <tr key={row.row} className={`border-t border-border ${rowTone(status)}`}>
                      <td className="px-4 py-3.5 align-top">
                        <StatusIcon status={status} />
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <Cell value={row.data.name} error={nameNote(row)} />
                        <span className="mt-0.5 block text-[11px] text-ink-secondary">
                          Row {row.row}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 align-top whitespace-nowrap">
                        <Cell value={row.data.phone} error={fieldError(row, "phone")} />
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <Cell value={row.data.email} error={fieldError(row, "email")} />
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <Cell value={row.data.events} error={fieldError(row, "events")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="overflow-hidden rounded-card border border-border md:hidden">
            {visible.map((row) => {
              const status = importRowStatus(row);
              return (
                <li
                  key={row.row}
                  className={`flex gap-3 border-t border-border p-4 first:border-t-0 ${rowTone(status)}`}
                >
                  <StatusIcon status={status} />
                  <div className="min-w-0 flex-1 text-sm">
                    <Cell value={row.data.name} error={nameNote(row)} />
                    <div className="mt-1.5 flex flex-col gap-1 text-xs text-ink-body">
                      <Cell value={row.data.phone} error={fieldError(row, "phone")} />
                      <Cell value={row.data.email} error={fieldError(row, "email")} />
                      <Cell value={row.data.events} error={fieldError(row, "events")} />
                    </div>
                    <span className="mt-1 block text-[11px] text-ink-secondary">Row {row.row}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > visible.length && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-ink-secondary">
                Showing {visible.length} of {rows.length} rows
              </p>
              <button
                type="button"
                onClick={() => setLimit((n) => n + SHOWN_AT_A_TIME)}
                className="flex h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-plum hover:bg-ivory"
              >
                Show more rows
              </button>
            </div>
          )}
        </>
      )}

      {error && <FormBanner>{error}</FormBanner>}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="flex h-11 items-center px-1 text-sm font-medium text-ink-body transition-colors hover:text-plum disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-body">
            <input
              type="checkbox"
              checked={skipDuplicates}
              disabled={busy}
              onChange={(e) => onSkipDuplicates(e.target.checked)}
              className="size-[18px] cursor-pointer accent-plum"
            />
            Skip possible duplicates
          </label>
          <Button
            size="lg"
            className="h-12 px-7"
            disabled={busy || counts.importable === 0}
            onClick={onImport}
          >
            {busy
              ? "Importing…"
              : `Import ${counts.importable} ${counts.importable === 1 ? "guest" : "guests"}`}
          </Button>
        </div>
      </div>
      <p className="-mt-3 text-xs text-ink-secondary">
        Rows that need fixing will be skipped. You can fix the file and upload it again.
      </p>
    </div>
  );
}
