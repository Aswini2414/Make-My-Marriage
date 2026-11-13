import { z } from "zod";
import { SEND_KINDS } from "./model";

// What the invitation routes accept. Browser-safe: no server-only imports.

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Choose a valid id.");

const kind = z.enum(SEND_KINDS, { error: "Choose invitation or reminder." });

export const startSendSchema = z.object({
  kind,
  // Left out: every event each guest is invited to.
  eventIds: z.array(objectId).min(1, "Choose at least one event.").max(100).optional(),
  guestFilter: z
    .object({
      guestIds: z.array(objectId).max(5000).optional(),
      inviteStatus: z.enum(["not_sent", "sent", "opened"]).optional(),
      rsvpStatus: z.enum(["not_replied"]).optional(),
    })
    .optional(),
});

export const previewQuery = z.object({ guestId: objectId, kind: kind.default("invite") });

export const testSchema = z.object({ kind: kind.default("invite"), guestId: objectId });

export type StartSendInput = z.infer<typeof startSendSchema>;
