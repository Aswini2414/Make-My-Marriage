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

const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const longDateWithDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const atNoonUtc = (date: string) => new Date(`${date}T12:00:00Z`);

/** "14 February 2027". */
export function formatDate(date: string): string {
  return longDate.format(atNoonUtc(date));
}

/** "Sunday, 14 February 2027". */
export function formatDateWithDay(date: string): string {
  return longDateWithDay.format(atNoonUtc(date)).replace(/^(\w+) /, "$1, ");
}

/** "113 days to go", "Today", or "3 days ago". */
export function daysToGoText(days: number): string {
  if (days === 0) return "Today";
  const n = Math.abs(days);
  const unit = n === 1 ? "day" : "days";
  return days > 0 ? `${n} ${unit} to go` : `${n} ${unit} ago`;
}

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "14 Feb 2027". */
export function formatShortDate(date: string): string {
  return shortDate.format(atNoonUtc(date));
}

/** Good morning, afternoon or evening, by the hour in India Standard Time. */
export function greetingIST(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: IST }).format(
      now,
    ),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export const WEDDING_YEARS_BACK = 2;
export const WEDDING_YEARS_AHEAD = 10;

/** The earliest and latest wedding date we accept, as YYYY-MM-DD. */
export function weddingDateBounds(today: string): { min: string; max: string } {
  return { min: addYears(today, -WEDDING_YEARS_BACK), max: addYears(today, WEDDING_YEARS_AHEAD) };
}

/** The same day some years away (29 February becomes 28 February when needed). */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = y + years;
  const day = m === 2 && d === 29 && new Date(Date.UTC(target, 1, 29)).getUTCMonth() !== 1 ? 28 : d;
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(target, 4)}-${pad(m, 2)}-${pad(day, 2)}`;
}
