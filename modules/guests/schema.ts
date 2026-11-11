import { z } from "zod";
import { hasNoControlChars, NO_CONTROL_CHARS } from "@/modules/auth/schema";
import { normalizePhone } from "./phone";

// Zod schemas for the guest routes, shared by the API, the import and (3B) the Guests page.
// Field rules mirror "guests" in docs/database-design.md. No server-only imports.

export const MAX_BULK_GUESTS = 500;
export const MAX_EVENTS_PER_GUEST = 100;

const line = (label: string, max: number) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Use at most ${max} characters.`)
    .refine(hasNoControlChars, NO_CONTROL_CHARS);

const optionalLine = (max: number) =>
  z
    .string({ error: "Enter text." })
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .refine(hasNoControlChars, NO_CONTROL_CHARS);

const emailField = z
  .string({ error: "Enter a valid email address." })
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

const PHONE_MESSAGE = "Enter a phone number like +91 98480 12345.";

const phoneField = z
  .string({ error: PHONE_MESSAGE })
  .trim()
  .max(30, "Use at most 30 characters.")
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (phone === null) {
      ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Choose a valid event.");

// Event ids are deduplicated here; whether they belong to the wedding is checked in the service.
const eventIds = z
  .array(objectId, { error: "Choose valid events." })
  .max(MAX_EVENTS_PER_GUEST, `Choose at most ${MAX_EVENTS_PER_GUEST} events.`)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

// An empty optional field is left out, so a form's empty strings count as "not set".
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** The person's own details, as typed in the form or read from an import row. */
export const guestDetailsSchema = z.object({
  name: line("the guest's name", 100),
  email: z.preprocess(emptyToUndefined, emailField.optional()),
  phone: z.preprocess(emptyToUndefined, phoneField.optional()),
  relation: z.preprocess(emptyToUndefined, optionalLine(60).optional()),
  household: z.preprocess(emptyToUndefined, optionalLine(80).optional()),
});

const confirmDuplicates = z.boolean().optional();

export const createGuestSchema = guestDetailsSchema.extend({
  eventIds: eventIds.optional(),
  confirmDuplicates,
});

// In an update, null (or an empty string) clears an optional field.
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToNull, schema.nullable()).optional();

export const updateGuestSchema = z
  .object({
    name: line("the guest's name", 100).optional(),
    email: clearable(emailField),
    phone: clearable(phoneField),
    relation: clearable(optionalLine(60)),
    household: clearable(optionalLine(80)),
    eventIds: eventIds.optional(),
    confirmDuplicates,
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "confirmDuplicates"),
    "Send at least one field to change.",
  );

export const RSVP_STATUSES = ["attending", "declined", "not_replied"] as const;
export const INVITE_STATUSES = ["not_sent", "sent", "opened"] as const;

export const listGuestsQuery = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  eventId: z.preprocess(emptyToUndefined, objectId.optional()),
  rsvpStatus: z.preprocess(emptyToUndefined, z.enum(RSVP_STATUSES).optional()),
  inviteStatus: z.preprocess(emptyToUndefined, z.enum(INVITE_STATUSES).optional()),
  household: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(["name", "-createdAt"]).default("name")),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
  cursor: z.preprocess(emptyToUndefined, z.string().max(600).optional()),
});

const guestIds = z
  .array(z.string(), { error: "Choose at least one guest." })
  .min(1, "Choose at least one guest.")
  .max(MAX_BULK_GUESTS, `Choose at most ${MAX_BULK_GUESTS} guests at a time.`);

export const bulkEventsSchema = z
  .object({
    guestIds,
    add: eventIds.optional(),
    remove: eventIds.optional(),
  })
  .refine(
    (v) => (v.add?.length ?? 0) + (v.remove?.length ?? 0) > 0,
    "Choose events to add or remove.",
  );

export const bulkDeleteSchema = z.object({ guestIds });

export const IMPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "relation",
  "household",
  "events",
] as const;

/** One row sent back to the commit step. Events are ids by then. */
export const importRowSchema = guestDetailsSchema.extend({ eventIds: eventIds.optional() });

export const importCommitSchema = z.object({
  rows: z.array(z.unknown()).max(2000, "Import at most 2,000 rows at a time."),
  onDuplicate: z.enum(["skip", "add"], { error: "Choose skip or add." }),
});

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
export type GuestDetails = z.infer<typeof guestDetailsSchema>;
export type ListGuestsQuery = z.infer<typeof listGuestsQuery>;
