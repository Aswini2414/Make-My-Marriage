import { z } from "zod";
import { hasNoControlChars, NO_CONTROL_CHARS } from "@/modules/auth/schema";
import { calendarDate } from "@/modules/weddings/schema";

// Zod schemas for the event routes, shared by the Events page and the API.
// Field rules mirror "events" in docs/database-design.md. No server-only imports: the
// browser uses this file.

export const DEFAULT_EVENT_TYPES = [
  "Engagement",
  "Haldi",
  "Mehendi",
  "Sangeet",
  "Pellikuthuru / Pellikoduku",
  "Wedding (Muhurtham)",
  "Reception",
  "Vratham / Pooja",
] as const;

export const MAX_CUSTOM_EVENT_TYPES = 30;
export const CUSTOM_TYPE_MAX = 40;

const line = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Use at most ${max} characters.`)
    .refine(hasNoControlChars, NO_CONTROL_CHARS);

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .refine(hasNoControlChars, NO_CONTROL_CHARS);

// Notes may hold line breaks, so they only reject the other control characters.
const NOTES_CONTROL = new RegExp(
  "[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]",
);

const HTTPS_PREFIX = /^https:\/\//i;

const httpsUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(2000, "Use at most 2000 characters.")
    .refine((v) => {
      // The model checks the same prefix, so "https:host" (which URL() accepts) is refused here
      // rather than failing later as a server error.
      if (!HTTPS_PREFIX.test(v)) return false;
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, message);

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

const youtubeUrl = httpsUrl("Enter a YouTube link that starts with https://.").refine((v) => {
  try {
    return YOUTUBE_HOSTS.has(new URL(v).hostname);
  } catch {
    return false;
  }
}, "Enter a youtube.com or youtu.be link.");

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 18:30.");

const eventFields = {
  name: line("the event name", 80),
  type: z.string().trim().min(1, "Choose an event type.").max(CUSTOM_TYPE_MAX),
  date: calendarDate("Choose the event date."),
  time,
  venueName: line("the venue name", 120),
  address: optionalLine(300),
  mapLink: httpsUrl("Enter a map link that starts with https://."),
  dressCode: optionalLine(120),
  notes: z
    .string()
    .trim()
    .max(1000, "Use at most 1000 characters.")
    .refine((v) => !NOTES_CONTROL.test(v), NO_CONTROL_CHARS),
  youtubeLink: youtubeUrl,
};

// An empty optional field is left out, so the form's empty strings count as "not set".
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const createEventSchema = z.object({
  name: eventFields.name,
  type: eventFields.type,
  date: eventFields.date,
  time: eventFields.time,
  venueName: eventFields.venueName,
  address: z.preprocess(emptyToUndefined, eventFields.address.optional()),
  mapLink: z.preprocess(emptyToUndefined, eventFields.mapLink.optional()),
  dressCode: z.preprocess(emptyToUndefined, eventFields.dressCode.optional()),
  notes: z.preprocess(emptyToUndefined, eventFields.notes.optional()),
  youtubeLink: z.preprocess(emptyToUndefined, eventFields.youtubeLink.optional()),
});

// In an update, null (or an empty string) clears an optional field.
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToNull, schema.nullable()).optional();

export const updateEventSchema = z
  .object({
    name: eventFields.name.optional(),
    type: eventFields.type.optional(),
    date: eventFields.date.optional(),
    time: eventFields.time.optional(),
    venueName: eventFields.venueName.optional(),
    address: clearable(eventFields.address),
    mapLink: clearable(eventFields.mapLink),
    dressCode: clearable(eventFields.dressCode),
    notes: clearable(eventFields.notes),
    youtubeLink: clearable(eventFields.youtubeLink),
  })
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change.");

export const addEventTypeSchema = z.object({
  name: line("a type name", CUSTOM_TYPE_MAX),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
