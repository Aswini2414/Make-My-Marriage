import { z } from "zod";
import { addYears, todayIST } from "@/lib/dates";
import { hasNoControlChars, NO_CONTROL_CHARS } from "@/modules/auth/schema";
import { NOTES_CONTROL } from "@/modules/events/schema";
import { calendarDate } from "@/modules/weddings/schema";

// Zod schemas for the task routes, shared by the Tasks page and the API.
// Field rules mirror "tasks" in docs/database-design.md. No server-only imports: the browser
// uses this file.

const objectId = (message: string) =>
  z.string({ error: message }).regex(/^[0-9a-f]{24}$/i, message);

const title = z
  .string({ error: "Please give the task a title." })
  .trim()
  .min(1, "Please give the task a title.")
  .max(150, "Use at most 150 characters.")
  .refine(hasNoControlChars, NO_CONTROL_CHARS);

// Notes may hold line breaks, so they only reject the other control characters.
const note = z
  .string({ error: "Enter text." })
  .trim()
  .max(1000, "Use at most 1000 characters.")
  .refine((v) => !NOTES_CONTROL.test(v), NO_CONTROL_CHARS);

const assigneeId = objectId("Choose who is doing this task.");
// The same window as the date picker on the Tasks page: five years back to ten ahead of today.
// Today is worked out on each check, so a long-open page never uses a stale date.
export const DUE_YEARS_BACK = 5;
export const DUE_YEARS_AHEAD = 10;
const dueDate = calendarDate("Choose a due date.").refine((v) => {
  const today = todayIST();
  return v >= addYears(today, -DUE_YEARS_BACK) && v <= addYears(today, DUE_YEARS_AHEAD);
}, "Choose a date from the last five years to the next ten.");
const eventId = objectId("Choose an event from the list.");

// A form's empty optional field is "not set" when adding, and "clear it" when editing.
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const createTaskSchema = z.object({
  title,
  assigneeId,
  dueDate,
  eventId: z.preprocess(emptyToUndefined, eventId.optional()),
  note: z.preprocess(emptyToUndefined, note.optional()),
});

// Status is not here: only the done and reopen routes change it.
export const updateTaskSchema = z
  .object({
    title: title.optional(),
    assigneeId: assigneeId.optional(),
    dueDate: dueDate.optional(),
    eventId: z.preprocess(emptyToNull, eventId.nullable()).optional(),
    note: z.preprocess(emptyToNull, note.nullable()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change.");

export const TASK_VIEWS = ["all", "mine", "overdue"] as const;

// Query-string values: an empty value means "no filter".
const optionalQuery = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

export const listTasksQuery = z.object({
  view: optionalQuery(z.enum(TASK_VIEWS)),
  status: optionalQuery(z.enum(["todo", "done"])),
  eventId: optionalQuery(eventId),
  assigneeId: optionalQuery(assigneeId),
  q: optionalQuery(z.string().trim().max(100, "Use at most 100 characters.")),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuery>;
