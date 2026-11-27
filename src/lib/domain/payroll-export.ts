// Monthly payroll inputs per employee, exported as CSV for Tally.
import type { DayStatus } from "./attendance";

export interface MonthDay {
  status: DayStatus;
  leaveCode: string | null;
  lateMinutes: number;
  otMinutes: number;
}

export interface MonthSummary {
  daysInMonth: number;
  present: number;
  halfDays: number;
  paidLeave: number;
  unpaidLeave: number;
  weeklyOffs: number;
  holidays: number;
  absent: number;
  missedPunch: number;
  paidDays: number;
  lopDays: number;
  lateCount: number;
  otHours: number;
}

/**
 * Paid-day rules (calendar-day basis):
 * present, paid leave, weekly off, holiday = 1; half day = 0.5;
 * absent, unpaid leave (LWP) and unresolved missed punch = 0.
 */
export function summariseMonth(days: MonthDay[], unpaidLeaveCodes: Set<string>): MonthSummary {
  const s: MonthSummary = {
    daysInMonth: days.length,
    present: 0,
    halfDays: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    weeklyOffs: 0,
    holidays: 0,
    absent: 0,
    missedPunch: 0,
    paidDays: 0,
    lopDays: 0,
    lateCount: 0,
    otHours: 0,
  };
  let otMinutes = 0;
  for (const d of days) {
    if (d.lateMinutes > 0) s.lateCount++;
    otMinutes += d.otMinutes;
    switch (d.status) {
      case "PRESENT": s.present++; break;
      case "HALF_DAY": s.halfDays++; break;
      case "WEEKLY_OFF": s.weeklyOffs++; break;
      case "HOLIDAY": s.holidays++; break;
      case "ABSENT": s.absent++; break;
      case "MISSED_PUNCH": s.missedPunch++; break;
      case "LEAVE":
        if (d.leaveCode && unpaidLeaveCodes.has(d.leaveCode)) s.unpaidLeave++;
        else s.paidLeave++;
        break;
    }
  }
  s.paidDays = s.present + s.paidLeave + s.weeklyOffs + s.holidays + s.halfDays * 0.5;
  s.lopDays = s.daysInMonth - s.paidDays;
  s.otHours = Math.round((otMinutes / 60) * 100) / 100;
  return s;
}

function csvCell(v: string | number): string {
  const str = String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export const TALLY_COLUMNS = [
  "Employee Code",
  "Employee Name",
  "Days in Month",
  "Present",
  "Half Days",
  "Paid Leave",
  "Unpaid Leave",
  "Weekly Offs",
  "Holidays",
  "Absent",
  "Missed Punch",
  "Paid Days",
  "LOP Days",
  "Late Marks",
  "OT Hours",
] as const;

export function toTallyCsv(rows: { code: string; name: string; summary: MonthSummary }[]): string {
  const lines = [TALLY_COLUMNS.join(",")];
  for (const { code, name, summary: s } of rows) {
    lines.push(
      [code, name, s.daysInMonth, s.present, s.halfDays, s.paidLeave, s.unpaidLeave, s.weeklyOffs,
        s.holidays, s.absent, s.missedPunch, s.paidDays, s.lopDays, s.lateCount, s.otHours]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
