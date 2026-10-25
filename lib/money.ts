// Money is stored and sent as whole paise. ₹80,000 is 8000000.
// These helpers are the only place rupees and paise are converted.

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 8000000 → "₹80,000"; 1100100 → "₹11,001". Paise are shown only when not zero. */
export function formatPaise(paise: number): string {
  return rupees.format(paise / 100);
}

/**
 * "80,000" or "80000.50" or 80000 → paise as an integer, without floating-point
 * rounding errors. Returns null for anything that isn't a valid amount.
 */
export function rupeesToPaise(input: string | number): number | null {
  const text = String(input).replace(/[₹,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const paise = whole * 100 + fraction;
  return Number.isSafeInteger(paise) ? paise : null;
}
