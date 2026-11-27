import { prisma } from "./db";
import { monthDates, dateOnly } from "../domain/time";
import { summariseMonth, type MonthDay, type MonthSummary } from "../domain/payroll-export";

export async function monthSummaries(month: string) {
  const dates = monthDates(month);
  const [employees, leaveTypes, records] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.leaveType.findMany({ where: { paid: false } }),
    prisma.attendanceDay.findMany({
      where: { date: { gte: dateOnly(dates[0]), lte: dateOnly(dates[dates.length - 1]) } },
    }),
  ]);
  const unpaid = new Set(leaveTypes.map((l) => l.code));
  const byEmp = new Map<number, MonthDay[]>();
  for (const r of records) {
    const list = byEmp.get(r.employeeId) ?? [];
    list.push(r);
    byEmp.set(r.employeeId, list);
  }
  const rows: { code: string; name: string; summary: MonthSummary }[] = [];
  for (const e of employees) {
    const days = byEmp.get(e.id) ?? [];
    // Days not yet processed (future or before joining) count as absent for payroll purposes.
    const padded: MonthDay[] = [
      ...days,
      ...Array.from({ length: dates.length - days.length }, (): MonthDay => ({
        status: "ABSENT", leaveCode: null, lateMinutes: 0, otMinutes: 0,
      })),
    ];
    rows.push({ code: e.code, name: e.name, summary: summariseMonth(padded, unpaid) });
  }
  return rows;
}
