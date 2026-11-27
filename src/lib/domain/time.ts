// India has no daylight saving, so IST is a fixed +05:30 offset.
export const IST_OFFSET = "+05:30";
const IST_OFFSET_MS = 330 * 60 * 1000;

/** "YYYY-MM-DD" + "HH:MM[:SS]" in IST -> Date (UTC instant). */
export function istDateTime(date: string, time: string): Date {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}${IST_OFFSET}`);
}

/** Date -> "YYYY-MM-DD" as seen in IST. */
export function istDateString(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Date -> "HH:MM" as seen in IST. */
export function istTimeString(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** "YYYY-MM-DD" -> Date at UTC midnight, the form Prisma uses for @db.Date. */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, n: number): string {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: string): number {
  return dateOnly(date).getUTCDay();
}

/** All dates of a "YYYY-MM" month. */
export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function todayIst(): string {
  return istDateString(new Date());
}
