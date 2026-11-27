import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { leaveBalances } from "@/lib/server/leave-service";
import { chargeableLeaveDays } from "@/lib/domain/leave";
import { dateOnly } from "@/lib/domain/time";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/components/format";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  sent: "Leave request sent for approval.",
  invalid: "Please check the dates and reason.",
  balance: "Not enough leave balance for that type.",
  zero: "Those dates are all weekly offs or holidays.",
  overlap: "You already have leave on some of those dates.",
};

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser();
  const { msg } = await searchParams;
  const [balances, requests] = await Promise.all([
    leaveBalances(user.id),
    prisma.leaveRequest.findMany({ where: { employeeId: user.id }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  async function apply(form: FormData) {
    "use server";
    const u = await requireUser();
    const from = String(form.get("from"));
    const to = String(form.get("to"));
    const typeId = Number(form.get("type"));
    const reason = String(form.get("reason") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || !reason) redirect("/leave?msg=invalid");
    const [emp, type, holidays] = await Promise.all([
      prisma.employee.findUniqueOrThrow({ where: { id: u.id }, include: { shift: true } }),
      prisma.leaveType.findUnique({ where: { id: typeId } }),
      prisma.holiday.findMany({ where: { date: { gte: dateOnly(from), lte: dateOnly(to) } } }),
    ]);
    if (!type) redirect("/leave?msg=invalid");
    const days = chargeableLeaveDays(from, to, emp.shift.weeklyOffs, new Set(holidays.map((h) => fmtDate(h.date))));
    if (days === 0) redirect("/leave?msg=zero");
    const overlap = await prisma.leaveRequest.count({
      where: { employeeId: u.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dateOnly(to) }, toDate: { gte: dateOnly(from) } },
    });
    if (overlap) redirect("/leave?msg=overlap");
    if (type.annualQuota.gt(0)) {
      const bal = (await leaveBalances(u.id)).find((b) => b.id === type.id)?.balance ?? 0;
      if (bal < days) redirect("/leave?msg=balance");
    }
    await prisma.leaveRequest.create({
      data: { employeeId: u.id, leaveTypeId: type.id, fromDate: dateOnly(from), toDate: dateOnly(to), days, reason },
    });
    revalidatePath("/leave");
    redirect("/leave?msg=sent");
  }

  async function cancel(form: FormData) {
    "use server";
    const u = await requireUser();
    await prisma.leaveRequest.updateMany({ where: { id: Number(form.get("id")), employeeId: u.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    revalidatePath("/leave");
  }

  return (
    <>
      <h1>Leave</h1>
      <div className="card">
        <div className="grid">
          {balances.filter((b) => b.annualQuota.gt(0)).map((b) => (
            <div key={b.id}><div className="stat">{b.balance}</div><div className="muted">{b.name} ({b.code})</div></div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Apply</h2>
        {msg && <p className={msg === "sent" ? undefined : "error"}>{MESSAGES[msg]}</p>}
        <form action={apply} className="inline">
          <label>Type
            <select name="type">{balances.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
          <label>From<input type="date" name="from" required /></label>
          <label>To<input type="date" name="to" required /></label>
          <label>Reason<input name="reason" required /></label>
          <button type="submit">Apply</button>
        </form>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.leaveType.code}</td><td>{fmtDate(r.fromDate)}</td><td>{fmtDate(r.toDate)}</td><td>{String(r.days)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.status === "PENDING" && (
                  <form action={cancel}><input type="hidden" name="id" value={r.id} /><button className="secondary">Cancel</button></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
