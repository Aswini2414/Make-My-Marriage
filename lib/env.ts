import "server-only";
import { z } from "zod";

// Environment variables are validated per area, so a missing R2 or Gmail setting only
// fails the feature that needs it, with a clear message, instead of every request.

const coreSchema = z.object({
  MONGODB_URI: z.string().startsWith("mongodb"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64-encoded"),
  APP_URL: z.url(),
});

const r2Schema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
});

const mailSchema = z.object({
  GMAIL_USER: z.email(),
  GMAIL_APP_PASSWORD: z.string().min(1),
  EMAIL_DAILY_CAP: z.coerce.number().int().positive().default(450),
});

function parse<T extends z.ZodType>(schema: T, area: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const vars = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid ${area} environment variables. ${vars}. See .env.example.`);
  }
  return result.data;
}

let core: z.infer<typeof coreSchema> | undefined;
let r2: z.infer<typeof r2Schema> | undefined;
let mail: z.infer<typeof mailSchema> | undefined;

export const coreEnv = () => (core ??= parse(coreSchema, "core"));
/** APP_URL alone, for pages that need the address but nothing secret, such as metadata. */
export const appUrl = () => parse(coreSchema.pick({ APP_URL: true }), "core").APP_URL;
/** MONGODB_URI alone, so `npm run db:indexes` can run against any database with just this set. */
export const mongoUri = () => parse(coreSchema.pick({ MONGODB_URI: true }), "database").MONGODB_URI;
export const r2Env = () => (r2 ??= parse(r2Schema, "R2"));
export const mailEnv = () => (mail ??= parse(mailSchema, "email"));
