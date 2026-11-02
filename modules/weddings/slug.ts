import { SLUG_MAX } from "./schema";

// Website addresses are lowercase letters, numbers and hyphens. Words that would clash
// with an app route or look official are refused. See docs/database-design.md.

const RESERVED = new Set([
  "about",
  "accept-invite",
  "admin",
  "api",
  "app",
  "assets",
  "dashboard",
  "events",
  "forgot-password",
  "guests",
  "help",
  "i",
  "invitations",
  "login",
  "logout",
  "members",
  "money",
  "onboarding",
  "photos",
  "privacy",
  "reset-password",
  "settings",
  "signup",
  "static",
  "support",
  "tasks",
  "terms",
  "u",
  "vendors",
  "w",
  "website",
  "www",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** "Priya & Ravi" becomes "priya-ravi". Accents drop; other scripts leave nothing. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "priya-weds-ravi" from the couple's names, kept short enough to take a "-2" suffix. */
export function baseSlug(bride: string, groom: string): string {
  const a = slugify(bride);
  const b = slugify(groom);
  const base = a && b ? `${a}-weds-${b}` : a || b || "our-wedding";
  const cut = base.slice(0, SLUG_MAX - 4).replace(/-+$/, "");
  return cut.length >= 3 && !isReservedSlug(cut) ? cut : "our-wedding";
}

/** The base address, then base-2, base-3 and so on. */
export function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}
