import { z } from "zod";
import { todayIST, weddingDateBounds } from "@/lib/dates";
import { hasNoControlChars, NO_CONTROL_CHARS } from "@/modules/auth/schema";

// Kept here, not in model.ts, because the browser imports this file.
export const THEMES = ["classic", "floral", "modern", "royal"] as const;

// Zod schemas for the wedding routes, shared by the onboarding form and the API.
// Field rules mirror docs/database-design.md.

const personName = (who: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${who}'s name.`)
    .max(60, "Use at most 60 characters.")
    .refine(hasNoControlChars, NO_CONTROL_CHARS);

/** A real calendar date written YYYY-MM-DD. */
export const calendarDate = (message: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
    }, message);

/** A wedding date: a real day within WEDDING_YEARS_BACK and WEDDING_YEARS_AHEAD of today. */
const weddingDay = (message: string) =>
  calendarDate(message).refine((v) => {
    const { min, max } = weddingDateBounds(todayIST());
    return v >= min && v <= max;
  }, "Choose a date from the last two years to the next ten.");

export const brideName = personName("bride");
export const groomName = personName("groom");
export const weddingDate = weddingDay("Choose the wedding date.");

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN, `Use at least ${SLUG_MIN} characters.`)
  .max(SLUG_MAX, `Use at most ${SLUG_MAX} characters.`)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use only letters, numbers and single hyphens, not at the start or end.",
  );

export const createWeddingSchema = z.object({ brideName, groomName, weddingDate });

export const updateWeddingSchema = z
  .object({
    brideName,
    groomName,
    weddingDate,
    slug,
    theme: z.enum(THEMES),
    websitePublished: z.boolean(),
    galleryEnabled: z.boolean(),
    rsvpCutoffDate: calendarDate("Choose a valid date.").nullable(),
  })
  .partial()
  // coverPhotoKey joins this schema with the files module, which can check the key was
  // issued for this wedding.
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change.");

export const deleteWeddingSchema = z.object({
  confirmSlug: z.string().trim().toLowerCase().min(1, "Type your website address to confirm."),
});

export const slugAvailableQuery = z.object({ slug });

export type CreateWeddingInput = z.infer<typeof createWeddingSchema>;
export type UpdateWeddingInput = z.infer<typeof updateWeddingSchema>;
