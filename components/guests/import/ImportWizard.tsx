"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowBackIcon } from "@/components/icons";
import { postForm, postJson } from "@/lib/api-client";
import { importCounts, rowsToCommit, skippedLine } from "@/modules/guests/format";
import type { ImportPreview, ImportResult } from "@/modules/guests/types";
import { DoneStep } from "./DoneStep";
import { ReviewStep } from "./ReviewStep";
import { type ImportStep, Stepper } from "./Stepper";
import { UploadStep } from "./UploadStep";

const HEADINGS: Record<ImportStep, { title: [string, string]; subtitle: string }> = {
  upload: { title: ["Import", "guests"], subtitle: "Add many guests from a spreadsheet." },
  review: { title: ["Review", "import"], subtitle: "Check each row before importing." },
  done: { title: ["Import", "complete"], subtitle: "Your guest list is up to date." },
};

/**
 * The import wizard: upload, review, done. The file is read once, sent to the preview, and then
 * dropped: only the checked rows stay in memory, and they go once the import is saved.
 */
export function ImportWizard({ exampleEvents }: { exampleEvents: string[] }) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview>();
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ created: number; skipped?: string }>();
  const heading = useRef<HTMLHeadingElement>(null);

  // Each step announces itself: focus moves to its heading.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  async function upload(file: File) {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    form.set("file", file);
    const result = await postForm<ImportPreview>("/api/guests/import/preview", form);
    setBusy(false);
    if (!result.ok) {
      return setError(
        result.error.code === "NETWORK"
          ? result.error.message
          : (result.error.fields?.file ?? result.error.message),
      );
    }
    if (result.data.total === 0) {
      return setError(
        "That file has no guests in it. Add one guest per row under the header row, or use the template.",
      );
    }
    setFileName(file.name);
    setPreview(result.data);
    setStep("review");
  }

  async function commit() {
    if (!preview || busy) return;
    setBusy(true);
    setError(undefined);
    const result = await postJson<ImportResult>("/api/guests/import/commit", {
      // Only the rows the preview found valid. The server checks them all again.
      rows: rowsToCommit(preview.rows),
      onDuplicate: skipDuplicates ? "skip" : "add",
    });
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    const counts = importCounts(preview, skipDuplicates);
    setDone({
      created: result.data.created,
      skipped: skippedLine(counts.needsFixing + result.data.invalid, result.data.skipped),
    });
    // The rows are no longer needed (and must not be imported twice).
    setPreview(undefined);
    setFileName("");
    setStep("done");
  }

  function startOver() {
    setPreview(undefined);
    setFileName("");
    setError(undefined);
    setDone(undefined);
    setStep("upload");
  }

  const { title, subtitle } = HEADINGS[step];
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-6 sm:p-8">
      <Link
        href="/guests"
        className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-ink-body transition-colors hover:text-plum"
      >
        <ArrowBackIcon className="text-base" />
        Back to guests
      </Link>
      <div className="mx-auto w-full max-w-5xl rounded-card border border-border bg-surface p-5 shadow-card sm:p-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-border pb-6">
          <div className="min-w-0">
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-3xl leading-tight text-plum focus:outline-none sm:text-4xl"
            >
              {title[0]} <em className="text-champagne-deep">{title[1]}</em>
            </h1>
            <p className="mt-1 text-sm text-ink-body">{subtitle}</p>
          </div>
          <Stepper step={step} />
        </div>

        {step === "upload" && (
          <UploadStep onFile={upload} busy={busy} error={error} exampleEvents={exampleEvents} />
        )}
        {step === "review" && preview && (
          <ReviewStep
            fileName={fileName}
            preview={preview}
            skipDuplicates={skipDuplicates}
            onSkipDuplicates={setSkipDuplicates}
            busy={busy}
            error={error}
            onBack={startOver}
            onImport={() => void commit()}
          />
        )}
        {step === "done" && done && (
          <DoneStep created={done.created} skipped={done.skipped} onAnother={startOver} />
        )}
      </div>
    </main>
  );
}
