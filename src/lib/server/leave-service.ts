import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function leaveBalances(employeeId: number) {
  const [types, sums] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { code: "asc" } }),
    prisma.leaveLedger.groupBy({ by: ["leaveTypeId"], where: { employeeId }, _sum: { days: true } }),
  ]);
  const map = new Map(sums.map((s) => [s.leaveTypeId, s._sum.days ?? new Prisma.Decimal(0)]));
  return types.map((t) => ({ ...t, balance: Number(map.get(t.id) ?? 0) }));
}

/** Credit one month of every paid leave type with a quota (annualQuota / 12) to all active staff. */
export async function creditMonthlyLeave(month: string) {
  const reason = `Monthly credit ${month}`;
  const [types, employees] = await Promise.all([
    prisma.leaveType.findMany({ where: { annualQuota: { gt: 0 } } }),
    prisma.employee.findMany({ where: { active: true } }),
  ]);
  for (const e of employees) {
    for (const t of types) {
      const exists = await prisma.leaveLedger.findFirst({
        where: { employeeId: e.id, leaveTypeId: t.id, reason },
      });
      if (exists) continue;
      await prisma.leaveLedger.create({
        data: { employeeId: e.id, leaveTypeId: t.id, days: t.annualQuota.div(12).toDecimalPlaces(2), reason },
      });
    }
  }
}
