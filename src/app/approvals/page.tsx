import { revalidatePath } from "next/cache";
import { requireUser, type SessionUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { processDate, processRange } from "@/lib/server/attendance-service";
import { audit } from "@/lib/server/audit";
import { fmtDate } from "@/components/format";

export const dynamic = "force-dynamic";

/** Admins approve anyone; managers approve their direct reports (never themselves). */
function scopeFor(user: SessionUser) {
  return user.role === "ADMIN"
    ? { employeeId: { not: user.id } }
    : { employee: { managerId: user.id } };
}

export default async function ApprovalsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const scope = scopeFor(user);
  const [leaves, regs] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { status: "PENDING", ...scope }, include: { employee: true, leaveType: true }, orderBy: { createdAt: "asc" } }),
    prisma.regularisation.findMany({ where: { status: "PENDING", ...scope }, include: { employee: true }, orderBy: { createdAt: "asc" } }),
  ]);

  async function decideLeave(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN", "MANAGER"]);
    const id = Number(form.get("id"));
    const approve = form.get("decision") === "approve";
    const req = await prisma.leaveRequest.findFirst({ where: { id, status: "PENDING", ...scopeFor(u) }, include: { leaveType: true } });
    if (!req) return;
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: u.id, decidedAt: new Date() },
      });
      if (approve && req.leaveType.annualQuota.gt(0)) {
        await tx.leaveLedger.create({
          data: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, days: req.days.neg(), reason: `Leave #${id}`, requestId: id },
        });
      }
    });
    await audit(u.id, approve ? "approve" : "reject", "LeaveRequest", id);
    if (approve) await processRange(fmtDate(req.fromDate), fmtDate(req.toDate));
    revalidatePath("/approvals");
  }

  async function decideReg(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN", "MANAGER"]);
    const id = Number(form.get("id"));
    const approve = form.get("decision") === "approve";
    const reg = await prisma.regularisation.findFirst({ where: { id, status: "PENDING", ...scopeFor(u) } });
    if (!reg) return;
    await prisma.regularisation.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: u.id, decidedAt: new Date() } });
    await audit(u.id, approve ? "approve" : "reject", "Regularisation", id);
    if (approve) await processDate(fmtDate(reg.date));
    revalidatePath("/approvals");
  }

  // One form per button so the decision never depends on which submitter the browser reports.
  const Buttons = ({ id, action }: { id: number; action: (f: FormData) => Promise<void> }) => (
    <div style={{ display: "flex", gap: 6 }}>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <button>Approve</button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <button className="secondary">Reject</button>
      </form>
    </div>
  );

  return (
    <>
      <h1>Approvals</h1>
      <div className="card table-wrap">
        <h2 style={{ marginTop: 0 }}>Leave ({leaves.length})</h2>
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id}>
                <td>{l.employee.name}</td><td>{l.leaveType.code}</td><td>{fmtDate(l.fromDate)}</td><td>{fmtDate(l.toDate)}</td>
                <td>{String(l.days)}</td><td>{l.reason}</td><td><Buttons id={l.id} action={decideLeave} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card table-wrap">
        <h2 style={{ marginTop: 0 }}>Punch corrections ({regs.length})</h2>
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {regs.map((r) => (
              <tr key={r.id}>
                <td>{r.employee.name}</td><td>{fmtDate(r.date)}</td><td>{r.inTime}</td><td>{r.outTime}</td>
                <td>{r.reason}</td><td><Buttons id={r.id} action={decideReg} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
