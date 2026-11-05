"use client";

import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { FormBanner } from "@/components/form/FormBanner";
import {
  AccountBalanceWalletIcon,
  ChecklistIcon,
  DeleteIcon,
  MailIcon,
  PersonOffIcon,
  PhotoLibraryIcon,
  QrCode2Icon,
  StorefrontIcon,
  WarningIcon,
} from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { deleteJson, getJson } from "@/lib/api-client";
import type { EventItem, Impact } from "@/modules/events/format";

type Props = {
  event: EventItem;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Line = { Icon: ComponentType<{ className?: string }>; text: ReactNode };

const strong = (text: string) => <strong className="font-semibold text-plum">{text}</strong>;

/** Only the things that would really change are listed. */
function impactLines(i: Impact): Line[] {
  const lines: Line[] = [];
  if (i.guests > 0) {
    lines.push({
      Icon: PersonOffIcon,
      text: <>{strong(plural(i.guests, "guest"))} will no longer be invited to this event</>,
    });
  }
  if (i.rsvps > 0) {
    lines.push({
      Icon: MailIcon,
      text: <>{strong(plural(i.rsvps, "RSVP"))} recorded for this event will be deleted</>,
    });
  }
  const money = [
    i.expenses > 0 && plural(i.expenses, "expense"),
    i.gifts > 0 && plural(i.gifts, "gift"),
  ].filter(Boolean);
  if (money.length > 0) {
    lines.push({
      Icon: AccountBalanceWalletIcon,
      text: <>{strong(money.join(" and "))} linked to it will be kept, but unlinked</>,
    });
  }
  if (i.tasks > 0) {
    lines.push({
      Icon: ChecklistIcon,
      text: <>{strong(plural(i.tasks, "task"))} linked to it will be kept, but unlinked</>,
    });
  }
  if (i.vendors > 0) {
    lines.push({
      Icon: StorefrontIcon,
      text: <>{strong(plural(i.vendors, "vendor"))} will no longer be linked to this event</>,
    });
  }
  if (i.photos > 0) {
    lines.push({
      Icon: PhotoLibraryIcon,
      text: <>{strong(plural(i.photos, "photo"))} will be kept, but no longer tied to this event</>,
    });
  }
  if (i.qrCodes > 0) {
    lines.push({
      Icon: QrCode2Icon,
      text: <>Its personalized {strong("QR code")} for guest photo uploads will stop working</>,
    });
  }
  return lines;
}

/** "Delete Haldi?" with what the delete would touch, from the delete-impact API. */
export function DeleteEventModal({ event, onClose, onDeleted }: Props) {
  const [impact, setImpact] = useState<Impact>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getJson<Impact>(`/api/events/${event.id}/delete-impact`).then((result) => {
      if (cancelled) return;
      if (result.ok) setImpact(result.data);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result = await deleteJson(`/api/events/${event.id}`);
    setBusy(false);
    // Already gone (deleted in another tab or by another member): the list should drop it too.
    if (result.ok || result.error.code === "NOT_FOUND") onDeleted(event.id);
    else setError(result.error.message);
  }

  const lines = impact ? impactLines(impact) : [];
  return (
    <Modal label={`Delete ${event.name}?`} onClose={() => !busy && onClose()}>
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-error-border bg-error-bg text-error">
          <WarningIcon className="text-2xl" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight text-plum">
            Delete <em className="text-error">{event.name}</em>?
          </h2>
          <p className="mt-1 text-xs text-ink-body">
            This will remove the event for everyone.
            {lines.length > 0 && " Here is what changes:"}
          </p>
        </div>
      </div>

      {lines.length > 0 && (
        <ul className="mt-5 flex flex-col gap-3.5 rounded-input border border-border bg-ivory p-4">
          {lines.map(({ Icon, text }, i) => (
            <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-ink">
              <Icon className="mt-0.5 shrink-0 text-base text-ink-secondary" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
      {!impact && !loadFailed && (
        <p className="mt-5 text-xs text-ink-secondary" role="status">
          Checking what this changes…
        </p>
      )}
      {loadFailed && (
        <p className="mt-5 text-xs text-ink-secondary">
          We couldn’t check what else this changes, but you can still delete it.
        </p>
      )}
      {error && <FormBanner className="mt-4">{error}</FormBanner>}

      <div className="mt-6 flex items-center justify-end gap-2 sm:gap-3">
        <button
          type="button"
          data-autofocus
          onClick={onClose}
          disabled={busy}
          className="flex h-11 items-center rounded-full px-5 text-sm font-medium text-plum transition-colors hover:bg-ivory disabled:pointer-events-none disabled:opacity-60"
        >
          Keep event
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy || (!impact && !loadFailed)}
          className="flex h-11 items-center gap-1.5 rounded-full bg-error px-6 text-sm font-medium whitespace-nowrap text-surface transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-60"
        >
          <DeleteIcon className="text-base" />
          Delete event
        </button>
      </div>
    </Modal>
  );
}
