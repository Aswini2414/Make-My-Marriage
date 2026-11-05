"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { PlusBoldIcon } from "@/components/icons";
import { compareEvents, type EventItem, groupEventsByDate } from "@/modules/events/format";
import { DeleteEventModal } from "./DeleteEventModal";
import { EmptyState } from "./EmptyState";
import { EventCard } from "./EventCard";
import { EventDrawer } from "./EventDrawer";

type Props = {
  events: EventItem[];
  customTypes: string[];
};

type Panel = { kind: "add"; type?: string } | { kind: "edit"; event: EventItem };

/** The Events page: the list, the add and edit drawer, and the delete confirmation. */
export function EventsView({ events: initial, customTypes: initialTypes }: Props) {
  const [events, setEvents] = useState(initial);
  const [customTypes, setCustomTypes] = useState(initialTypes);
  const [panel, setPanel] = useState<Panel>();
  const [deleting, setDeleting] = useState<EventItem>();
  const returnTo = useRef<string>("add");

  // When a drawer or the modal closes, focus goes back to the control that opened it. If
  // that control is gone (a deleted event), it goes to the Add event button.
  const dialogOpen = !!panel || !!deleting;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !dialogOpen && document.activeElement === document.body) {
      const target =
        document.querySelector<HTMLElement>(`[data-focus-return="${returnTo.current}"]`) ??
        document.querySelector<HTMLElement>('[data-focus-return="add"]');
      target?.focus();
    }
    wasOpen.current = dialogOpen;
  }, [dialogOpen]);

  const open = (next: Panel, from: string) => {
    returnTo.current = from;
    setPanel(next);
  };

  const groups = groupEventsByDate(events);

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight text-plum">
            Your <em className="text-champagne-deep">events</em>
          </h1>
          <p className="mt-1 text-sm text-ink-body">
            Everything happening across the wedding, in date order.
          </p>
        </div>
        <Button data-focus-return="add" onClick={() => open({ kind: "add" }, "add")}>
          <PlusBoldIcon className="size-3.5" />
          Add event
        </Button>
      </div>

      {events.length === 0 ? (
        <EmptyState onAdd={(type) => open({ kind: "add", type }, "add")} />
      ) : (
        <div className="flex max-w-4xl flex-col gap-6">
          {groups.map((group) => (
            <section key={group.date} className="flex flex-col gap-3">
              <h2 className="flex flex-wrap items-center gap-x-3 font-sans text-[11px] font-semibold tracking-wider text-ink uppercase">
                {group.heading}
                <span aria-hidden="true" className="size-1.5 rounded-full bg-champagne-deep" />
                <span className="text-xs font-normal tracking-normal text-ink-secondary normal-case">
                  {group.label}
                </span>
              </h2>
              {group.events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={() => open({ kind: "edit", event }, event.id)}
                  onDelete={() => {
                    returnTo.current = event.id;
                    setDeleting(event);
                  }}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {panel && (
        <EventDrawer
          event={panel.kind === "edit" ? panel.event : undefined}
          initialType={panel.kind === "add" ? panel.type : undefined}
          customTypes={customTypes}
          onTypesChanged={setCustomTypes}
          onSaved={(saved) => {
            setEvents((list) =>
              [...list.filter((e) => e.id !== saved.id), saved].sort(compareEvents),
            );
            returnTo.current = saved.id;
            setPanel(undefined);
          }}
          onDelete={
            panel.kind === "edit"
              ? () => {
                  setDeleting(panel.event);
                  setPanel(undefined);
                }
              : undefined
          }
          onClose={() => setPanel(undefined)}
        />
      )}

      {deleting && (
        <DeleteEventModal
          event={deleting}
          onClose={() => setDeleting(undefined)}
          onDeleted={(id) => {
            setEvents((list) => list.filter((e) => e.id !== id));
            setDeleting(undefined);
          }}
        />
      )}
    </main>
  );
}
