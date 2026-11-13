import { z } from "zod";
import { MAX_HEADCOUNT } from "./model";

// What the public RSVP route accepts. Browser-safe: no server-only imports.

/** A guest's invitation token: 32 random bytes as base64url is always 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const eventId = z.string().regex(/^[0-9a-f]{24}$/i, "Choose a valid event.");

const answerSchema = z
  .object({
    eventId,
    attending: z.boolean({ error: "Choose yes or no." }),
    headcount: z
      .number({ error: "Enter how many people." })
      .int("Enter a whole number.")
      .optional(),
  })
  .superRefine((a, ctx) => {
    if (!a.attending) return; // headcount is ignored (stored as 0) when not attending
    if (a.headcount === undefined || a.headcount < 1 || a.headcount > MAX_HEADCOUNT) {
      ctx.addIssue({
        code: "custom",
        path: ["headcount"],
        message: `Enter how many people are coming, from 1 to ${MAX_HEADCOUNT}.`,
      });
    }
  });

export const rsvpBodySchema = z.object({
  // A guest has few events; the cap only stops a huge body from being checked item by item.
  answers: z
    .array(answerSchema)
    .min(1, "Answer at least one event.")
    .max(50, "Too many answers.")
    .refine((list) => new Set(list.map((a) => a.eventId.toLowerCase())).size === list.length, {
      message: "Answer each event once.",
    }),
});

export type RsvpBody = z.infer<typeof rsvpBodySchema>;
