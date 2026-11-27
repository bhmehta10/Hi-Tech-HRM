import { describe, expect, it } from "vitest";
import { summariseMonth, toTallyCsv, type MonthDay } from "../src/lib/domain/payroll-export";
import { chargeableLeaveDays } from "../src/lib/domain/leave";

const d = (status: MonthDay["status"], extra: Partial<MonthDay> = {}): MonthDay =>
  ({ status, leaveCode: null, lateMinutes: 0, otMinutes: 0, ...extra });

describe("summariseMonth", () => {
  it("computes paid days and LOP", () => {
    const days = [
      ...Array(20).fill(d("PRESENT")),
      d("HALF_DAY"),
      d("LEAVE", { leaveCode: "CL" }),
      d("LEAVE", { leaveCode: "LWP" }),
      d("ABSENT"),
      d("MISSED_PUNCH"),
      ...Array(4).fill(d("WEEKLY_OFF")),
      d("HOLIDAY", { otMinutes: 90 }),
      d("PRESENT", { lateMinutes: 20 }),
    ];
    const s = summariseMonth(days, new Set(["LWP"]));
    expect(s.daysInMonth).toBe(31);
    expect(s.paidDays).toBe(21 + 1 + 4 + 1 + 0.5);
    expect(s.lopDays).toBe(3.5);
    expect(s.lateCount).toBe(1);
    expect(s.otHours).toBe(1.5);
  });

  it("escapes names in CSV", () => {
    const s = summariseMonth([d("PRESENT")], new Set());
    const csv = toTallyCsv([{ code: "E001", name: 'Shah, "Raj"', summary: s }]);
    expect(csv.split("\r\n")[1].startsWith('E001,"Shah, ""Raj""",1,1')).toBe(true);
  });
});

describe("chargeableLeaveDays", () => {
  it("skips Sundays and holidays", () => {
    // Thu 26 Nov to Tue 1 Dec 2026, Sunday off, Mon 30 Nov a holiday
    expect(chargeableLeaveDays("2026-11-26", "2026-12-01", [0], new Set(["2026-11-30"]))).toBe(4);
  });
});
