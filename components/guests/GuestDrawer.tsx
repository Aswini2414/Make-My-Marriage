"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { TextField } from "@/components/form/TextField";
import { DeleteIcon } from "@/components/icons";
import { DiscardPrompt } from "@/components/ui/DiscardPrompt";
import { Drawer } from "@/components/ui/Drawer";
import { useDiscardGuard } from "@/components/ui/useDiscardGuard";
import { fieldErrors, patchJson, postJson } from "@/lib/api-client";
import { createGuestSchema, updateGuestSchema } from "@/modules/guests/schema";
import type { DuplicateMatch, GuestItem, HouseholdItem } from "@/modules/guests/types";
import { DuplicateWarning } from "./DuplicateWarning";
import { EventChecklist } from "./EventChecklist";
import { HouseholdField } from "./HouseholdField";

type Props = {
  /** The guest being edited, or undefined to add a new one. */
  guest?: GuestItem;
  events: { id: string; name: string }[];
  households: HouseholdItem[];
  onSaved: (guest: GuestItem) => void;
  onDelete?: () => void;
  onClose: () => void;
};

type Values = {
  name: string;
  relation: string;
  household: string;
  phone: string;
  email: string;
  eventIds: string[];
};

type SaveBody = { guest: GuestItem } | { saved: false; duplicates: DuplicateMatch[] };

function initialValues(guest: GuestItem | undefined): Values {
  return {
    name: guest?.name ?? "",
    relation: guest?.relation ?? "",
    household: guest?.household ?? "",
    phone: guest?.phone ?? "",
    email: guest?.email ?? "",
    eventIds: guest?.eventIds ?? [],
  };
}

const same = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** The Add guest and Edit guest drawer: one form for both. */
export function GuestDrawer({ guest, events, households, onSaved, onDelete, onClose }: Props) {
  const editing = !!guest;
  const [initial] = useState(() => initialValues(guest));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>();
  const [busy, setBusy] = useState(false);

  const dirty =
    values.name !== initial.name ||
    values.relation !== initial.relation ||
    values.household !== initial.household ||
    values.phone !== initial.phone ||
    values.email !== initial.email ||
    !same(values.eventIds, initial.eventIds);
  const guard = useDiscardGuard({ dirty, busy, onClose });

  /** Any change clears that field's error and the duplicate warning, which was about the old data. */
  function change(patch: Partial<Values>) {
    setValues((v) => ({ ...v, ...patch }));
    setDuplicates(undefined);
    setErrors((current) => {
      const rest = { ...current };
      for (const key of Object.keys(patch)) delete rest[key];
      return rest;
    });
  }
  const text = (key: Exclude<keyof Values, "eventIds">) => (e: { target: { value: string } }) =>
    change({ [key]: e.target.value });

  async function save(confirmDuplicates: boolean) {
    if (busy) return;
    setBanner(undefined);
    const body = { ...values, ...(confirmDuplicates ? { confirmDuplicates: true } : {}) };
    const parsed = (editing ? updateGuestSchema : createGuestSchema).safeParse(body);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = editing
      ? await patchJson<SaveBody>(`/api/guests/${guest.id}`, parsed.data)
      : await postJson<SaveBody>("/api/guests", parsed.data);
    setBusy(false);
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        return setBanner("This guest no longer exists. Close this and refresh the list.");
      }
      if (result.error.fields) setErrors(result.error.fields);
      else setBanner(result.error.message);
      return;
    }
    if ("duplicates" in result.data) return setDuplicates(result.data.duplicates);
    onSaved(result.data.guest);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  const allSelected = events.length > 0 && values.eventIds.length === events.length;
  return (
    <Drawer
      title={
        <>
          {editing ? "Edit" : "Add"} <em className="text-champagne-deep">guest</em>
        </>
      }
      onClose={guard.requestClose}
      footer={
        guard.confirming ? (
          <DiscardPrompt onKeep={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <div className="flex items-center justify-between gap-3">
            {editing && onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="-ml-2 flex h-11 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-error transition-colors hover:text-error/80 disabled:pointer-events-none disabled:opacity-50"
              >
                <DeleteIcon className="text-base" />
                Delete guest
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={guard.requestClose}
                disabled={busy}
                className="flex h-11 items-center px-3 text-sm font-medium text-ink-body transition-colors hover:text-plum disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                type="submit"
                form="guest-form"
                size="md"
                className="h-11 px-6"
                disabled={busy}
              >
                {editing ? "Save changes" : "Save guest"}
              </Button>
            </div>
          </div>
        )
      }
    >
      <form id="guest-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {banner && <FormBanner>{banner}</FormBanner>}
        {duplicates && (
          <DuplicateWarning
            matches={duplicates}
            confirmLabel={editing ? "Save anyway" : "Add anyway"}
            busy={busy}
            onConfirm={() => void save(true)}
            onCancel={() => setDuplicates(undefined)}
          />
        )}
        <TextField
          id="name"
          caps
          label="Full name *"
          placeholder="e.g. Meena Reddy"
          autoComplete="off"
          value={values.name}
          onChange={text("name")}
          error={errors.name}
        />
        <TextField
          id="relation"
          caps
          label="Relation"
          placeholder="e.g. Cousin, Family friend"
          autoComplete="off"
          value={values.relation}
          onChange={text("relation")}
          error={errors.relation}
        />
        <HouseholdField
          value={values.household}
          onChange={(household) => change({ household })}
          households={households}
          error={errors.household}
        />
        <TextField
          id="phone"
          type="tel"
          caps
          label="Phone"
          placeholder="+91 98765 43210"
          autoComplete="off"
          value={values.phone}
          onChange={text("phone")}
          error={errors.phone}
        />
        <TextField
          id="email"
          type="email"
          caps
          label="Email"
          placeholder="guest@example.com"
          autoComplete="off"
          value={values.email}
          onChange={text("email")}
          error={errors.email}
        />

        <fieldset className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <legend className="p-0 text-[11px] font-semibold tracking-wider text-ink-secondary uppercase">
              Invited to
            </legend>
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => change({ eventIds: allSelected ? [] : events.map((e) => e.id) })}
                className="flex min-h-11 items-center text-xs font-medium text-plum underline underline-offset-2 sm:min-h-8"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          {events.length === 0 ? (
            <p className="rounded-input border border-border bg-ivory p-4 text-xs leading-relaxed text-ink-body">
              Add an event first to invite guests to it.{" "}
              <Link
                href="/events"
                className="font-medium text-plum underline decoration-champagne/60 underline-offset-2"
              >
                Go to Events
              </Link>
              . You can still save this guest now.
            </p>
          ) : (
            <EventChecklist
              name="eventIds"
              events={events}
              value={values.eventIds}
              onChange={(eventIds) => change({ eventIds })}
            />
          )}
          {errors.eventIds && (
            <p className="mt-1.5 text-[11px] font-medium text-error">{errors.eventIds}</p>
          )}
        </fieldset>
      </form>
    </Drawer>
  );
}
