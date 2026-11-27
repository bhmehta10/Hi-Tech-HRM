import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { leaveBalances } from "@/lib/server/leave-service";
import { dateOnly, todayIst } from "@/lib/domain/time";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtTime } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const today = todayIst();
  const [mine, balances] = await Promise.all([
    prisma.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: user.id, date: dateOnly(today) } } }),
    leaveBalances(user.id),
  ]);

  let team: { status: string; _count: number }[] = [];
  let pending = 0;
  let devices: { serial: string; name: string | null; lastSeenAt: Date | null }[] = [];
  if (user.role !== "EMPLOYEE") {
    const scope = user.role === "ADMIN" ? {} : { employee: { managerId: user.id } };
    const grouped = await prisma.attendanceDay.groupBy({
      by: ["status"], where: { date: dateOnly(today), ...scope }, _count: true,
    });
    team = grouped.map((g) => ({ status: g.status, _count: g._count }));
    const approverScope = user.role === "ADMIN" ? {} : { employee: { managerId: user.id } };
    pending =
      (await prisma.leaveRequest.count({ where: { status: "PENDING", ...approverScope } })) +
      (await prisma.regularisation.count({ where: { status: "PENDING", ...approverScope } }));
    if (user.role === "ADMIN") devices = await prisma.device.findMany({ orderBy: { serial: "asc" } });
  }

  return (
    <>
      <h1>Good day, {user.name}</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Today ({today})</h2>
        {mine ? (
          <p>
            <StatusBadge status={mine.status} /> In {fmtTime(mine.firstIn)} · Out {fmtTime(mine.lastOut)}
          </p>
        ) : (
          <p className="muted">Not processed yet. Punches are processed every 15 minutes.</p>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Leave balance</h2>
        <div className="grid">
          {balances.filter((b) => b.annualQuota.gt(0)).map((b) => (
            <div key={b.id}><div className="stat">{b.balance}</div><div className="muted">{b.name}</div></div>
          ))}
        </div>
        <p><Link href="/leave">Apply for leave</Link></p>
      </div>
      {user.role !== "EMPLOYEE" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{user.role === "ADMIN" ? "Company" : "My team"} today</h2>
          <div className="grid">
            {team.length === 0 && <p className="muted">No attendance processed yet today.</p>}
            {team.map((t) => (
              <div key={t.status}><div className="stat">{t._count}</div><StatusBadge status={t.status} /></div>
            ))}
          </div>
          <p><Link href="/approvals">{pending} pending approval{pending === 1 ? "" : "s"}</Link></p>
        </div>
      )}
      {devices.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Devices</h2>
          {devices.map((d) => {
            const stale = !d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > 30 * 60_000;
            return (
              <p key={d.serial} className={stale ? "error" : undefined}>
                {d.name ?? d.serial}: last seen {d.lastSeenAt ? d.lastSeenAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never"}
              </p>
            );
          })}
        </div>
      )}
    </>
  );
}
