// Calendar dates are "YYYY-MM-DD" strings and times of day are "HH:mm".
// "Today" always means today in India Standard Time.

const IST = "Asia/Kolkata";

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(now);
}

/** Whole days from one YYYY-MM-DD date to another; negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return Date.UTC(y, m - 1, d);
}
