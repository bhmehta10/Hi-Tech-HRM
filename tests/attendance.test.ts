import { describe, expect, it } from "vitest";
import { evaluateDay, type ShiftRules } from "../src/lib/domain/attendance";
import { istDateTime } from "../src/lib/domain/time";

const day: ShiftRules = {
  startTime: "09:30", endTime: "18:30", graceMinutes: 10,
  fullDayMinutes: 480, halfDayMinutes: 240, otThresholdMinutes: 30, weeklyOffs: [0],
};
const night: ShiftRules = { ...day, startTime: "22:00", endTime: "06:00" };
const at = (d: string, t: string) => istDateTime(d, t);
// 2026-11-26 is a Thursday, 2026-11-29 a Sunday.

describe("evaluateDay", () => {
  it("marks an on-time full day present", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false,
      punches: [at("2026-11-26", "09:35"), at("2026-11-26", "18:40")] });
    expect(r.status).toBe("PRESENT");
    expect(r.lateMinutes).toBe(0);
    expect(r.workedMinutes).toBe(545);
    expect(r.otMinutes).toBe(0);
  });

  it("counts late minutes from shift start once past grace", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false,
      punches: [at("2026-11-26", "09:55"), at("2026-11-26", "18:31")] });
    expect(r.lateMinutes).toBe(25);
    expect(r.status).toBe("PRESENT");
  });

  it("gives half day for 4 to 8 hours worked", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false,
      punches: [at("2026-11-26", "09:30"), at("2026-11-26", "14:00")] });
    expect(r.status).toBe("HALF_DAY");
  });

  it("flags a single punch as missed punch, ignoring double taps", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false,
      punches: [at("2026-11-26", "09:30"), at("2026-11-26", "09:31")] });
    expect(r.status).toBe("MISSED_PUNCH");
  });

  it("marks no punches absent on a working day", () => {
    expect(evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false, punches: [] }).status).toBe("ABSENT");
  });

  it("counts overtime past the threshold", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false,
      punches: [at("2026-11-26", "09:30"), at("2026-11-26", "20:00")] });
    expect(r.otMinutes).toBe(90);
  });

  it("handles a night shift crossing midnight", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: night, isHoliday: false,
      punches: [at("2026-11-26", "21:58"), at("2026-11-27", "06:05"), at("2026-11-27", "21:59")] });
    expect(r.status).toBe("PRESENT");
    expect(r.workedMinutes).toBe(487);
  });

  it("respects weekly off, holiday and leave before absence", () => {
    expect(evaluateDay({ date: "2026-11-29", shift: day, isHoliday: false, punches: [] }).status).toBe("WEEKLY_OFF");
    expect(evaluateDay({ date: "2026-11-26", shift: day, isHoliday: true, punches: [] }).status).toBe("HOLIDAY");
    const l = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false, punches: [], leaveCode: "CL" });
    expect(l.status).toBe("LEAVE");
    expect(l.leaveCode).toBe("CL");
  });

  it("uses an approved regularisation instead of punches", () => {
    const r = evaluateDay({ date: "2026-11-26", shift: day, isHoliday: false,
      punches: [at("2026-11-26", "09:30")], manual: { inTime: "09:30", outTime: "18:30" } });
    expect(r.status).toBe("PRESENT");
  });
});
