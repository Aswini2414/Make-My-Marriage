import { z } from "zod";

// Zod schemas for the auth routes. Field rules mirror docs/database-design.md.

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

// bcrypt only reads the first 72 bytes, so longer passwords would be silently cut short.
export const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .refine((v) => Buffer.byteLength(v) <= 72, "Use at most 72 characters.");

// Control characters (line breaks, NUL, escape codes) never belong in a name.
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f-\u009f\u2028\u2029]");
export const NO_CONTROL_CHARS = "Use letters, numbers and punctuation only.";
export const hasNoControlChars = (v: string) => !CONTROL_CHARS.test(v);

export const name = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Use at most 80 characters.")
  .refine(hasNoControlChars, NO_CONTROL_CHARS);

export const signupSchema = z.object({ name, email, password: newPassword });

// Login accepts any password text; the length rules apply only when one is chosen.
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "This link is invalid or has expired."),
  password: newPassword,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword,
});

export type SignupInput = z.infer<typeof signupSchema>;
