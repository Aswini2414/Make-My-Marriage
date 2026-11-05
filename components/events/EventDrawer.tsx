"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { Select } from "@/components/form/Select";
import { TextArea } from "@/components/form/TextArea";
import { TextField } from "@/components/form/TextField";
import { DeleteIcon, GroupIcon } from "@/components/icons";
import { DiscardPrompt } from "@/components/ui/DiscardPrompt";
import { Drawer } from "@/components/ui/Drawer";
import { useDiscardGuard } from "@/components/ui/useDiscardGuard";
import { fieldErrors, patchJson, postJson } from "@/lib/api-client";
import { ADD_NEW_TYPE, type EventItem, eventTypeOptions } from "@/modules/events/format";
import { createEventSchema, updateEventSchema } from "@/modules/events/schema";
import { NewTypeField } from "./NewTypeField";

type Values = {
  name: string;
  type: string;
  date: string;
  time: string;
  venueName: string;
  address: string;
  mapLink: string;
  dressCode: string;
  notes: string;
  youtubeLink: string;
};

type Props = {
  /** The event being edited, or undefined to add a new one. */
  event?: EventItem;
  /** The type to pre-select when adding, from the empty-state chips. */
  initialType?: string;
  customTypes: string[];
  /** The wedding's custom types after one was added. */
  onTypesChanged: (custom: string[]) => void;
  onSaved: (event: EventItem) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const label = (text: string, required?: boolean) => (required ? `${text} *` : text);

/** The errors without one field, once the person starts fixing it. */
function without(errors: Record<string, string>, key: string) {
  const rest = { ...errors };
  delete rest[key];
  return rest;
}

function initialValues(event: EventItem | undefined, initialType: string | undefined): Values {
  return {
    name: event?.name ?? "",
    type: event?.type ?? initialType ?? "",
    date: event?.date ?? "",
    time: event?.time ?? "",
    venueName: event?.venueName ?? "",
    address: event?.address ?? "",
    mapLink: event?.mapLink ?? "",
    dressCode: event?.dressCode ?? "",
    notes: event?.notes ?? "",
    youtubeLink: event?.youtubeLink ?? "",
  };
}

/** The Add event and Edit event drawer: one form for both. */
export function EventDrawer({
  event,
  initialType,
  customTypes,
  onTypesChanged,
  onSaved,
  onDelete,
  onClose,
}: Props) {
  const editing = !!event;
  const [initial] = useState(() => initialValues(event, initialType));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [addingType, setAddingType] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== initial[k]);

  const guard = useDiscardGuard({ dirty, busy, onClose });

  const set = (key: keyof Values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((current) => without(current, key));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBanner(undefined);
    const parsed = (editing ? updateEventSchema : createEventSchema).safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = editing
      ? await patchJson<{ event: EventItem }>(`/api/events/${event.id}`, parsed.data)
      : await postJson<{ event: EventItem }>("/api/events", parsed.data);
    setBusy(false);
    if (result.ok) return onSaved(result.data.event);
    if (result.error.fields) setErrors(result.error.fields);
    else setBanner(result.error.message);
  }

  const verb = editing ? "Edit" : "Add";
  return (
    <Drawer
      title={
        <>
          {verb} <em className="text-champagne-deep">event</em>
        </>
      }
      subtitle={
        editing ? `Changing the details for ${event.name}` : "Fill in the details for your plan"
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
                Delete event
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
                form="event-form"
                size="md"
                className="h-11 px-6"
                disabled={busy}
              >
                {editing ? "Save changes" : "Save event"}
              </Button>
            </div>
          </div>
        )
      }
    >
      <form
        id="event-form"
        onSubmit={submit}
        noValidate
        method="post"
        className="flex flex-col gap-4"
      >
        {banner && <FormBanner>{banner}</FormBanner>}
        <TextField
          id="name"
          caps
          label={label("Event name", true)}
          placeholder="e.g. Sangeet Night"
          autoComplete="off"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        <div>
          <Select
            id="type"
            caps
            label={label("Event type", true)}
            placeholder="Select event type…"
            options={eventTypeOptions(customTypes)}
            value={addingType ? ADD_NEW_TYPE : values.type}
            onChange={(e) => {
              if (e.target.value === ADD_NEW_TYPE) return setAddingType(true);
              setAddingType(false);
              set("type")(e);
            }}
            error={errors.type}
          />
          {addingType && (
            <NewTypeField
              onAdded={(custom) => {
                onTypesChanged(custom);
                // The type just added is last in the list the server saved.
                const added = custom.at(-1);
                if (added) setValues((v) => ({ ...v, type: added }));
                setErrors((current) => without(current, "type"));
                setAddingType(false);
              }}
              onCancel={() => setAddingType(false)}
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 min-[420px]:gap-3">
          <TextField
            id="date"
            type="date"
            caps
            label={label("Date", true)}
            value={values.date}
            onChange={set("date")}
            error={errors.date}
          />
          <TextField
            id="time"
            type="time"
            caps
            label={label("Time", true)}
            value={values.time}
            onChange={set("time")}
            error={errors.time}
          />
        </div>
        <TextField
          id="venueName"
          caps
          label={label("Venue name", true)}
          placeholder="e.g. Shri Krishna Kalyana Mandapam"
          autoComplete="off"
          value={values.venueName}
          onChange={set("venueName")}
          error={errors.venueName}
        />
        <TextArea
          id="address"
          caps
          label="Address"
          placeholder="Road No. 10, Jubilee Hills, Hyderabad 500033"
          rows={2}
          value={values.address}
          onChange={set("address")}
          error={errors.address}
        />
        <TextField
          id="mapLink"
          type="url"
          caps
          label="Google Maps link"
          placeholder="https://maps.app.goo.gl/…"
          autoComplete="off"
          hint="Paste a share link from Google Maps"
          value={values.mapLink}
          onChange={set("mapLink")}
          error={errors.mapLink}
        />
        <TextField
          id="dressCode"
          caps
          optional
          label="Dress code"
          placeholder="e.g. Traditional, yellow pastel hues"
          autoComplete="off"
          value={values.dressCode}
          onChange={set("dressCode")}
          error={errors.dressCode}
        />
        <TextArea
          id="notes"
          caps
          optional
          label="Notes"
          placeholder="Anything guests should know, like parking or timings"
          rows={2}
          value={values.notes}
          onChange={set("notes")}
          error={errors.notes}
        />
        <TextField
          id="youtubeLink"
          type="url"
          caps
          optional
          label="YouTube Live link"
          placeholder="https://youtube.com/live/…"
          autoComplete="off"
          hint="Add this later, closer to the day"
          value={values.youtubeLink}
          onChange={set("youtubeLink")}
          error={errors.youtubeLink}
        />
        {editing && (
          <div className="mt-1 flex items-center justify-between gap-3 rounded-input border border-border bg-lilac p-4">
            <div className="flex min-w-0 items-center gap-3">
              <GroupIcon className="shrink-0 text-2xl text-champagne-deep" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-plum">
                  {event.guestCount} {event.guestCount === 1 ? "guest" : "guests"} invited
                </p>
                <p className="text-[11px] text-ink-secondary">
                  Assigned to this event on the Guests page
                </p>
              </div>
            </div>
            <Link
              href="/guests"
              className="tap-area shrink-0 text-xs font-medium text-champagne-deep underline decoration-champagne/60 transition-colors hover:text-plum"
            >
              Manage guest list →
            </Link>
          </div>
        )}
      </form>
    </Drawer>
  );
}
