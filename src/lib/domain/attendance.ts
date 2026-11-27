// Turns one employee's punches for one day into an attendance status.
// Pure function: no database access, so the rules are easy to test and re-run.
import { addDays, istDateTime, minutesBetween, weekday } from "./time";

export type DayStatus =
  | "PRESENT"
  | "HALF_DAY"
  | "ABSENT"
  | "MISSED_PUNCH"
  | "WEEKLY_OFF"
  | "HOLIDAY"
  | "LEAVE";

export interface ShiftRules {
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"; earlier than start means next day
  graceMinutes: number;
  fullDayMinutes: number;
  halfDayMinutes: number;
  otThresholdMinutes: number;
  weeklyOffs: number[];
}

export interface DayContext {
  date: string; // "YYYY-MM-DD"
  shift: ShiftRules;
  punches: Date[]; // any order, may include punches outside the window
  isHoliday: boolean;
  leaveCode?: string | null; // approved full-day leave
  /** Approved regularisation overrides punches. */
  manual?: { inTime: string; outTime: string } | null;
}

export interface DayResult {
  status: DayStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  otMinutes: number;
  leaveCode: string | null;
}

/** Shift start/end as instants; night shifts end on the next calendar day. */
export function shiftBounds(date: string, shift: ShiftRules): { start: Date; end: Date } {
  const start = istDateTime(date, shift.startTime);
  const endDate = shift.endTime <= shift.startTime ? addDays(date, 1) : date;
  return { start, end: istDateTime(endDate, shift.endTime) };
}

/** Punches that belong to this shift day: from 4h before start to 20h after it. */
export function punchWindow(date: string, shift: ShiftRules): { from: Date; to: Date } {
  const { start } = shiftBounds(date, shift);
  return {
    from: new Date(start.getTime() - 4 * 3600_000),
    to: new Date(start.getTime() + 20 * 3600_000),
  };
}

export function evaluateDay(ctx: DayContext): DayResult {
  const { shift, date } = ctx;
  const { start, end } = shiftBounds(date, shift);
  const { from, to } = punchWindow(date, shift);

  let firstIn: Date | null = null;
  let lastOut: Date | null = null;

  if (ctx.manual) {
    const s = shiftBounds(date, { ...shift, startTime: ctx.manual.inTime, endTime: ctx.manual.outTime });
    firstIn = s.start;
    lastOut = s.end;
  } else {
    const inWindow = ctx.punches
      .filter((p) => p >= from && p < to)
      .sort((a, b) => a.getTime() - b.getTime());
    if (inWindow.length > 0) {
      firstIn = inWindow[0];
      // A second punch within 2 minutes of the first is a double-tap, not an out punch.
      const last = inWindow[inWindow.length - 1];
      lastOut = minutesBetween(firstIn, last) > 2 ? last : null;
    }
  }

  const workedMinutes = firstIn && lastOut ? Math.max(0, minutesBetween(firstIn, lastOut)) : 0;
  const base = { firstIn, lastOut, workedMinutes, leaveCode: null as string | null };

  // Non-working days: record any work done but never mark absent.
  if (ctx.isHoliday) return { ...base, status: "HOLIDAY", lateMinutes: 0, otMinutes: 0 };
  if (shift.weeklyOffs.includes(weekday(date)))
    return { ...base, status: "WEEKLY_OFF", lateMinutes: 0, otMinutes: 0 };
  if (ctx.leaveCode)
    return { ...base, status: "LEAVE", lateMinutes: 0, otMinutes: 0, leaveCode: ctx.leaveCode };

  if (!firstIn) return { ...base, status: "ABSENT", lateMinutes: 0, otMinutes: 0 };
  if (!lastOut) return { ...base, status: "MISSED_PUNCH", lateMinutes: 0, otMinutes: 0 };

  const lateBy = minutesBetween(start, firstIn);
  const lateMinutes = lateBy > shift.graceMinutes ? lateBy : 0;
  const pastEnd = minutesBetween(end, lastOut);
  const otMinutes = pastEnd >= shift.otThresholdMinutes ? pastEnd : 0;

  let status: DayStatus = "ABSENT";
  if (workedMinutes >= shift.fullDayMinutes) status = "PRESENT";
  else if (workedMinutes >= shift.halfDayMinutes) status = "HALF_DAY";

  return { ...base, status, lateMinutes, otMinutes };
}
