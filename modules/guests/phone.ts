// Phone numbers for guests. No server-only imports: the Guests page uses this file too.
//
// People type numbers every which way ("98480-12345", "(+91) 98480 12345", "09848012345").
// Every number is stored in ONE form so that the same number always compares equal, which is
// what the duplicate check and the search rely on:
//   - Indian numbers (10 digits starting 6 to 9, with or without +91 or a leading 0)
//     are stored as "+91 98480 12345".
//   - Other numbers with a "+" are stored as "+" and the digits, no spaces.
//   - Other numbers without a "+" are stored as the digits only.
// The way it was typed is not kept.

const ALLOWED = /^\+?\d+$/;
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;

function indian(ten: string): string {
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

/** The stored form of a phone number, or null when it is not a usable number. */
export function normalizePhone(input: string): string | null {
  // Spaces, brackets and hyphens are only for reading; "(+91) 98480 12345" is "+91 98480 12345".
  const text = input.replace(/[\s()-]/g, "");
  // Digits only, with one optional "+" at the very start.
  if (!ALLOWED.test(text)) return null;
  const plus = text.startsWith("+");
  const digits = plus ? text.slice(1) : text;

  if (digits.length === 10 && !plus && INDIAN_MOBILE.test(digits)) return indian(digits);
  if (digits.length === 11 && !plus && digits[0] === "0" && INDIAN_MOBILE.test(digits.slice(1))) {
    return indian(digits.slice(1));
  }
  if (digits.length === 12 && digits.startsWith("91") && INDIAN_MOBILE.test(digits.slice(2))) {
    return indian(digits.slice(2));
  }
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return null;
  return plus ? `+${digits}` : digits;
}

/**
 * A regular expression source that finds `digits` inside a stored phone number whatever the
 * spaces are: "98480" finds "+91 98480 12345", and "8012" finds it across the space.
 */
export function phoneSearchPattern(digits: string): string {
  return digits.split("").join(String.raw`\s?`);
}
