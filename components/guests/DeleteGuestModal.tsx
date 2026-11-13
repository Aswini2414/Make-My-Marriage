"use client";

import { useState } from "react";
import { FormBanner } from "@/components/form/FormBanner";
import { DeleteIcon, EventIcon, PersonOffIcon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { deleteJson, postJson } from "@/lib/api-client";
import { deleteImpactLine } from "@/modules/guests/format";

type Props =
  | {
      kind: "one";
      id: string;
      name: string;
      /** The names of the events the guest is invited to. */
      eventNames: string[];
      /** How many events the guest has answered. */
      rsvps: number;
      onClose: () => void;
      onDeleted: () => void;
    }
  | {
      kind: "many";
      ids: string[];
      onClose: () => void;
      onDeleted: () => void;
    };

/** Confirms deleting one guest (with what it changes) or the selected guests. */
export function DeleteGuestModal(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const many = props.kind === "many";
  const count = props.kind === "many" ? props.ids.length : 1;
  const guests = `${count} ${count === 1 ? "guest" : "guests"}`;

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result =
      props.kind === "one"
        ? await deleteJson(`/api/guests/${props.id}`)
        : await postJson("/api/guests/bulk-delete", { guestIds: props.ids });
    setBusy(false);
    // Already gone (another tab or member): the list should drop it too.
    if (result.ok || (props.kind === "one" && result.error.code === "NOT_FOUND")) {
      return props.onDeleted();
    }
    setError(
      result.error.code === "NOT_FOUND"
        ? "Some of these guests were already deleted. Close this and refresh the list."
        : result.error.message,
    );
  }

  return (
    <Modal
      label={props.kind === "one" ? `Delete ${props.name}?` : `Delete ${guests}?`}
      onClose={() => !busy && props.onClose()}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-error-border bg-error-bg text-error">
          <PersonOffIcon className="text-2xl" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight break-words text-plum">
            Delete <em className="text-error">{props.kind === "one" ? props.name : guests}</em>?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-body">
            {props.kind === "one"
              ? `This removes ${props.name} from the guest list and from every event they are invited to.`
              : `This removes ${count === 1 ? "this guest" : `these ${count} guests`} from the guest list and from every event they are invited to. Any RSVPs they have given are deleted too.`}
          </p>
        </div>
      </div>

      {props.kind === "one" && (
        <p className="mt-5 flex items-start gap-3 rounded-input border border-border bg-ivory p-4 text-xs leading-relaxed text-ink">
          <EventIcon className="mt-0.5 shrink-0 text-base text-ink-secondary" />
          <span>{deleteImpactLine(props.eventNames, props.rsvps)}</span>
        </p>
      )}
      {error && <FormBanner className="mt-4">{error}</FormBanner>}

      <div className="mt-6 flex items-center justify-end gap-2 sm:gap-3">
        <button
          type="button"
          data-autofocus
          onClick={props.onClose}
          disabled={busy}
          className="flex h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-plum transition-colors hover:bg-ivory disabled:pointer-events-none disabled:opacity-60"
        >
          {many ? "Keep guests" : "Keep guest"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="flex h-11 items-center gap-1.5 rounded-full bg-error px-6 text-sm font-medium whitespace-nowrap text-surface transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-60"
        >
          <DeleteIcon className="text-base" />
          {many ? `Delete ${guests}` : "Delete guest"}
        </button>
      </div>
    </Modal>
  );
}
