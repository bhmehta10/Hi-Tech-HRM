// Database side of attendance: loads punches, leave, holidays and regularisations,
// runs the pure rules in domain/attendance.ts and stores the result.
import { prisma } from "./db";
import { evaluateDay, punchWindow } from "../domain/attendance";
import { addDays, dateOnly, istDateString, monthDates } from "../domain/time";

export async function isMonthLocked(date: string): Promise<boolean> {
  return !!(await prisma.attendanceLock.findUnique({ where: { month: date.slice(0, 7) } }));
}

/** Recompute attendance for every active employee on one date. Skips locked months. */
export async function processDate(date: string): Promise<number> {
  if (await isMonthLocked(date)) return 0;
  const employees = await prisma.employee.findMany({
    where: { active: true, joinDate: { lte: dateOnly(date) } },
    include: { shift: true },
  });
  const holiday = await prisma.holiday.findUnique({ where: { date: dateOnly(date) } });
  let n = 0;
  for (const emp of employees) {
    const { from, to } = punchWindow(date, emp.shift);
    const [punches, leave, reg] = await Promise.all([
      emp.deviceUserId
        ? prisma.rawPunch.findMany({
            where: { deviceUserId: emp.deviceUserId, punchTime: { gte: from, lt: to } },
            select: { punchTime: true },
          })
        : Promise.resolve([]),
      prisma.leaveRequest.findFirst({
        where: {
          employeeId: emp.id,
          status: "APPROVED",
          fromDate: { lte: dateOnly(date) },
          toDate: { gte: dateOnly(date) },
        },
        include: { leaveType: true },
      }),
      prisma.regularisation.findFirst({
        where: { employeeId: emp.id, date: dateOnly(date), status: "APPROVED" },
        orderBy: { decidedAt: "desc" },
      }),
    ]);
    const r = evaluateDay({
      date,
      shift: emp.shift,
      punches: punches.map((p) => p.punchTime),
      isHoliday: !!holiday,
      leaveCode: leave?.leaveType.code ?? null,
      manual: reg ? { inTime: reg.inTime, outTime: reg.outTime } : null,
    });
    await prisma.attendanceDay.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: dateOnly(date) } },
      create: { employeeId: emp.id, date: dateOnly(date), ...r, processedAt: new Date() },
      update: { ...r, processedAt: new Date() },
    });
    n++;
  }
  return n;
}

export async function processRange(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) await processDate(d);
}

export async function processMonth(month: string) {
  const today = istDateString(new Date());
  for (const d of monthDates(month)) if (d <= today) await processDate(d);
}
