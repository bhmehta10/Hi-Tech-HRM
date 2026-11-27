import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { dateOnly, monthDates } from "@/lib/domain/time";
import { isMonthLocked } from "@/lib/server/attendance-service";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtHours, fmtTime, isMonth, thisMonth } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: { searchParams: Promise<{ month?: string; emp?: string; msg?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : thisMonth();
  let employeeId = user.id;
  const viewable =
    user.role === "ADMIN"
      ? await prisma.employee.findMany({ where: { active: true }, orderBy: { code: "asc" } })
      : user.role === "MANAGER"
        ? await prisma.employee.findMany({ where: { OR: [{ id: user.id }, { managerId: user.id }] }, orderBy: { code: "asc" } })
        : [];
  if (sp.emp && viewable.some((e) => e.id === Number(sp.emp))) employeeId = Number(sp.emp);

  const dates = monthDates(month);
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId, date: { gte: dateOnly(dates[0]), lte: dateOnly(dates[dates.length - 1]) } },
    orderBy: { date: "asc" },
  });

  async function regularise(form: FormData) {
    "use server";
    const u = await requireUser();
    const date = String(form.get("date"));
    const inTime = String(form.get("inTime"));
    const outTime = String(form.get("outTime"));
    const reason = String(form.get("reason") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(inTime) || !/^\d{2}:\d{2}$/.test(outTime) || !reason)
      redirect("/attendance?msg=invalid");
    if (await isMonthLocked(date)) redirect("/attendance?msg=locked");
    await prisma.regularisation.create({ data: { employeeId: u.id, date: dateOnly(date), inTime, outTime, reason } });
    revalidatePath("/attendance");
    redirect("/attendance?msg=sent");
  }

  return (
    <>
      <h1>Attendance</h1>
      <form className="inline card" method="get">
        <label>Month<input type="month" name="month" defaultValue={month} /></label>
        {viewable.length > 0 && (
          <label>Employee
            <select name="emp" defaultValue={employeeId}>
              {viewable.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className="secondary">Show</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Late</th><th>OT</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id}>
                <td>{fmtDate(d.date)}</td><td><StatusBadge status={d.status} extra={d.leaveCode} /></td>
                <td>{fmtTime(d.firstIn)}</td><td>{fmtTime(d.lastOut)}</td><td>{fmtHours(d.workedMinutes)}</td>
                <td>{d.lateMinutes ? `${d.lateMinutes}m` : "–"}</td><td>{fmtHours(d.otMinutes)}</td>
              </tr>
            ))}
            {days.length === 0 && <tr><td colSpan={7} className="muted">No attendance for this month yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Fix a missed or wrong punch</h2>
        {sp.msg === "sent" && <p>Request sent to your manager.</p>}
        {sp.msg === "invalid" && <p className="error">Please fill in every field.</p>}
        {sp.msg === "locked" && <p className="error">That month is locked for payroll. Ask HR.</p>}
        <form action={regularise} className="inline">
          <label>Date<input type="date" name="date" required /></label>
          <label>In<input type="time" name="inTime" required /></label>
          <label>Out<input type="time" name="outTime" required /></label>
          <label>Reason<input name="reason" required /></label>
          <button type="submit">Send request</button>
        </form>
      </div>
    </>
  );
}
