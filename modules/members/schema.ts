import { z } from "zod";
import { name, newPassword } from "@/modules/auth/schema";

// Zod schemas for the members routes, shared by the Members page, the accept-invite page
// and the API. Field rules mirror docs/database-design.md.

// Kept here, not in model.ts, because the browser imports this file.
export const ROLES = ["admin", "manager"] as const;
export type Role = (typeof ROLES)[number];

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

const role = z.enum(ROLES, "Choose Admin or Manager.");

export const inviteSchema = z.object({ name, email, role });

export const changeRoleSchema = z.object({ role });

// An existing account may have any password; a new one must follow the password rules,
// which the service checks once it knows which case it is.
export const acceptSchema = z.object({
  token: z.string().min(1, "This link is invalid or has expired."),
  password: z.string().min(1, "Enter your password."),
  name: name.optional(),
});

export const acceptQuery = z.object({ token: z.string().min(1) });

export { newPassword };

export type InviteInput = z.infer<typeof inviteSchema>;
export type AcceptInput = z.infer<typeof acceptSchema>;
