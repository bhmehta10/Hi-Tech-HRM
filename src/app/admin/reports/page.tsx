import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { processMonth } from "@/lib/server/attendance-service";
import { monthSummaries } from "@/lib/server/payroll-service";
import { audit } from "@/lib/server/audit";
import { isMonth, thisMonth } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : thisMonth();
  const [rows, lock] = await Promise.all([
    monthSummaries(month),
    prisma.attendanceLock.findUnique({ where: { month } }),
  ]);
  const missed = rows.reduce((n, r) => n + r.summary.missedPunch, 0);

  async function reprocess(form: FormData) {
    "use server";
    await requireUser(["ADMIN"]);
    const m = String(form.get("month"));
    if (isMonth(m)) await processMonth(m);
    revalidatePath("/admin/reports");
    redirect(`/admin/reports?month=${m}`);
  }

  async function toggleLock(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN"]);
    const m = String(form.get("month"));
    if (!isMonth(m)) return;
    const existing = await prisma.attendanceLock.findUnique({ where: { month: m } });
    if (existing) await prisma.attendanceLock.delete({ where: { month: m } });
    else await prisma.attendanceLock.create({ data: { month: m, lockedBy: u.id } });
    await audit(u.id, existing ? "unlock" : "lock", "AttendanceLock", m);
    revalidatePath("/admin/reports");
    redirect(`/admin/reports?month=${m}`);
  }

  return (
    <>
      <h1>Monthly attendance and payroll inputs</h1>
      <div className="card inline" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <form method="get" className="inline">
          <label>Month<input type="month" name="month" defaultValue={month} /></label>
          <button className="secondary">Show</button>
        </form>
        <form action={reprocess}><input type="hidden" name="month" value={month} /><button className="secondary" disabled={!!lock}>Re-process month</button></form>
        <form action={toggleLock}><input type="hidden" name="month" value={month} /><button className="secondary">{lock ? "Unlock month" : "Lock month for payroll"}</button></form>
        <a href={`/api/export/tally?month=${month}`}><button type="button">Download for Tally (CSV)</button></a>
      </div>
      {lock && <p className="muted">Locked on {lock.lockedAt.toLocaleDateString("en-IN")}. Unlock to make changes.</p>}
      {missed > 0 && <p className="error">{missed} missed punch day(s) are counted as unpaid until corrected.</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Present</th><th>Half</th><th>Paid leave</th><th>LWP</th><th>Off/Hol</th><th>Absent</th><th>Missed</th><th>Paid days</th><th>LOP</th><th>Late</th><th>OT h</th></tr></thead>
          <tbody>
            {rows.map(({ code, name, summary: s }) => (
              <tr key={code}>
                <td>{code}</td><td>{name}</td><td>{s.present}</td><td>{s.halfDays}</td><td>{s.paidLeave}</td><td>{s.unpaidLeave}</td>
                <td>{s.weeklyOffs + s.holidays}</td><td>{s.absent}</td><td>{s.missedPunch}</td><td><strong>{s.paidDays}</strong></td>
                <td>{s.lopDays}</td><td>{s.lateCount}</td><td>{s.otHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
