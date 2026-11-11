"use client";

import { WarningIcon } from "@/components/icons";
import type { DuplicateMatch } from "@/modules/guests/types";

type Props = {
  matches: DuplicateMatch[];
  /** "Add anyway" when adding, "Save anyway" when editing. */
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function sentence(m: DuplicateMatch) {
  const what =
    m.matchedOn.length === 2
      ? "email and phone number"
      : m.matchedOn[0] === "phone"
        ? "phone number"
        : "email";
  return (
    <>
      A guest with this {what} already exists: <strong className="font-semibold">{m.name}</strong>.
    </>
  );
}

/** The duplicate warning: the matching guests, and the member's say-so to save anyway. */
export function DuplicateWarning({ matches, confirmLabel, busy, onConfirm, onCancel }: Props) {
  return (
    <div
      role="alert"
      className="rounded-input border border-error-border bg-error-bg p-3.5 text-[13px] leading-snug text-error"
    >
      <ul className="flex flex-col gap-1.5">
        {matches.slice(0, 3).map((m) => (
          <li key={m.id} className="flex items-start gap-2.5">
            <WarningIcon className="mt-px shrink-0 text-lg" />
            <span>{sentence(m)}</span>
          </li>
        ))}
      </ul>
      {matches.length > 3 && <p className="mt-1.5 pl-7 text-xs">and {matches.length - 3} more.</p>}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-error-border pt-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex h-11 items-center rounded-full px-4 text-xs font-medium transition-colors hover:bg-surface/60 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex h-11 items-center rounded-full bg-error px-5 text-xs font-medium text-surface transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
