import { formatDateWithDay } from "@/lib/dates";
import { DEFAULT_EVENT_TYPES } from "./schema";

// Pure helpers for the Events page. No server-only imports: the browser uses this file.

export const WEDDING_EVENT_TYPE = "Wedding (Muhurtham)";
/** The dropdown value that opens the "New type name" field. */
export const ADD_NEW_TYPE = "__add_new_type__";

export type EventItem = {
  id: string;
  name: string;
  type: string;
  date: string;
  time: string;
  venueName: string;
  address?: string;
  mapLink?: string;
  dressCode?: string;
  notes?: string;
  youtubeLink?: string;
  guestCount: number;
  /** Set on the Events list only: how the invited guests have answered. */
  rsvp?: { attending: number; declined: number; notReplied: number; headcount: number };
};

/** The short label for a type chip: the Wedding type reads "Wedding", as in the design. */
export function typeChipLabel(type: string): string {
  return type === WEDDING_EVENT_TYPE ? "Wedding" : type;
}

/** Everything an event delete can touch. Each key has a `count` and `cleanup` in dependents.ts. */
export const IMPACT_KEYS = [
  "guests",
  "rsvps",
  "expenses",
  "gifts",
  "tasks",
  "vendors",
  "qrCodes",
  "photos",
] as const;

export type ImpactKey = (typeof IMPACT_KEYS)[number];
/** The answer of GET /api/events/:id/delete-impact. */
export type Impact = Record<ImpactKey, number>;

export type EventGroup<T extends Pick<EventItem, "date" | "time" | "type"> = EventItem> = {
  date: string;
  /** "Friday, 12 February 2027" */
  heading: string;
  /** "1 event", "2 events", or "Wedding Day" when the Wedding event is in the group. */
  label: string;
  events: T[];
};

/** Date then time, the order the API returns. */
export function compareEvents(
  a: Pick<EventItem, "date" | "time" | "name">,
  b: Pick<EventItem, "date" | "time" | "name">,
) {
  return (
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.name.localeCompare(b.name)
  );
}

/** Events grouped under one heading per day, days and events in order. */
export function groupEventsByDate<T extends Pick<EventItem, "date" | "time" | "type" | "name">>(
  events: T[],
): EventGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const event of [...events].sort(compareEvents)) {
    const day = groups.get(event.date);
    if (day) day.push(event);
    else groups.set(event.date, [event]);
  }
  return [...groups].map(([date, items]) => ({
    date,
    heading: formatDateWithDay(date),
    label: items.some((e) => e.type === WEDDING_EVENT_TYPE)
      ? "Wedding Day"
      : `${items.length} ${items.length === 1 ? "event" : "events"}`,
    events: items,
  }));
}

export type TypeOption = { value: string; label: string; disabled?: boolean };

/** The type dropdown: defaults, then this wedding's custom types, a divider and "+ Add new type". */
export function eventTypeOptions(
  custom: readonly string[],
  defaults: readonly string[] = DEFAULT_EVENT_TYPES,
): TypeOption[] {
  return [
    ...defaults.map((t) => ({ value: t, label: t })),
    ...custom.map((t) => ({ value: t, label: t })),
    { value: "__divider__", label: "───────────────", disabled: true },
    { value: ADD_NEW_TYPE, label: "+ Add new type" },
  ];
}
