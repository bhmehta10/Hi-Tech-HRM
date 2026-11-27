import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { parseAttlog } from "@/lib/domain/essl";
import { processDate } from "@/lib/server/attendance-service";
import { dateOnly, istDateString } from "@/lib/domain/time";
import { fmtDate } from "@/components/format";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireUser(["ADMIN"]);
  const { msg } = await searchParams;
  const [devices, holidays, shifts, departments, employees, leaveTypes] = await Promise.all([
    prisma.device.findMany({ orderBy: { serial: "asc" } }),
    prisma.holiday.findMany({ where: { date: { gte: dateOnly(`${new Date().getFullYear()}-01-01`) } }, orderBy: { date: "asc" } }),
    prisma.shift.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.leaveType.findMany({ where: { annualQuota: { gt: 0 } }, orderBy: { code: "asc" } }),
  ]);

  async function addDevice(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN"]);
    const serial = String(form.get("serial") ?? "").trim();
    if (!serial) return;
    await prisma.device.upsert({ where: { serial }, create: { serial, name: String(form.get("name") || serial) }, update: {} });
    await audit(u.id, "create", "Device", serial);
    revalidatePath("/admin/setup");
  }

  async function addHoliday(form: FormData) {
    "use server";
    await requireUser(["ADMIN"]);
    const date = String(form.get("date"));
    const name = String(form.get("name") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return;
    await prisma.holiday.upsert({ where: { date: dateOnly(date) }, create: { date: dateOnly(date), name }, update: { name } });
    await processDate(date);
    revalidatePath("/admin/setup");
  }

  async function saveShift(form: FormData) {
    "use server";
    await requireUser(["ADMIN"]);
    const time = (k: string) => { const v = String(form.get(k)); return /^\d{2}:\d{2}$/.test(v) ? v : null; };
    const startTime = time("startTime"), endTime = time("endTime");
    const name = String(form.get("name") ?? "").trim();
    if (!startTime || !endTime || !name) return;
    const data = {
      name, startTime, endTime,
      graceMinutes: Number(form.get("graceMinutes")) || 0,
      fullDayMinutes: Number(form.get("fullDayMinutes")) || 480,
      halfDayMinutes: Number(form.get("halfDayMinutes")) || 240,
      weeklyOffs: form.getAll("weeklyOffs").map(Number),
    };
    const id = Number(form.get("id"));
    if (id) await prisma.shift.update({ where: { id }, data });
    else await prisma.shift.create({ data });
    revalidatePath("/admin/setup");
  }

  async function addDepartment(form: FormData) {
    "use server";
    await requireUser(["ADMIN"]);
    const name = String(form.get("name") ?? "").trim();
    if (name) await prisma.department.upsert({ where: { name }, create: { name }, update: {} });
    revalidatePath("/admin/setup");
  }

  async function adjustLeave(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN"]);
    const employeeId = Number(form.get("employeeId"));
    const leaveTypeId = Number(form.get("leaveTypeId"));
    const days = Number(form.get("days"));
    const note = String(form.get("note") ?? "").trim() || "Opening balance";
    if (!employeeId || !leaveTypeId || !Number.isFinite(days) || days === 0) return;
    await prisma.leaveLedger.create({ data: { employeeId, leaveTypeId, days, reason: `Adjustment: ${note}` } });
    await audit(u.id, "adjust", "LeaveLedger", employeeId, { leaveTypeId, days, note });
    redirect("/admin/setup?msg=leave-adjusted");
  }

  async function importPunches(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN"]);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) redirect("/admin/setup?msg=nofile");
    // Accepts the device's own attendance log export (tab separated) or CSV: user id, YYYY-MM-DD HH:MM:SS
    const body = (await file.text()).replace(/,/g, "\t");
    const { punches } = parseAttlog(body);
    const res = await prisma.rawPunch.createMany({
      data: punches.map((p) => ({ ...p, deviceSerial: "IMPORT", source: "csv" })),
      skipDuplicates: true,
    });
    await audit(u.id, "import", "RawPunch", undefined, { received: punches.length, added: res.count });
    const dates = [...new Set(punches.map((p) => istDateString(p.punchTime)))].sort();
    for (const d of dates) await processDate(d);
    redirect(`/admin/setup?msg=imported-${res.count}`);
  }

  return (
    <>
      <h1>Setup</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Biometric devices</h2>
        <p className="muted">Point each eSSL device&apos;s Cloud Server / ADMS setting at this server&apos;s address and port, then add its serial number here. See the README for steps.</p>
        <table><tbody>
          {devices.map((d) => (
            <tr key={d.id}><td>{d.name}</td><td>{d.serial}</td><td>{d.lastSeenAt ? `last seen ${d.lastSeenAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "never connected"}</td></tr>
          ))}
        </tbody></table>
        <form action={addDevice} className="inline" style={{ marginTop: 8 }}>
          <label>Serial number<input name="serial" required /></label>
          <label>Name<input name="name" placeholder="Main gate" /></label>
          <button>Add device</button>
        </form>
        <h2>Import punches from a file</h2>
        {msg?.startsWith("imported-") && <p>{msg.slice(9)} new punches imported and processed.</p>}
        <form action={importPunches} className="inline">
          <input type="file" name="file" accept=".txt,.dat,.csv" required />
          <button className="secondary">Import</button>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Shifts</h2>
        {[...shifts, null].map((s) => (
          <form key={s?.id ?? "new"} action={saveShift} className="inline" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={s?.id ?? ""} />
            <label>Name<input name="name" defaultValue={s?.name} required size={10} /></label>
            <label>Start<input type="time" name="startTime" defaultValue={s?.startTime} required /></label>
            <label>End<input type="time" name="endTime" defaultValue={s?.endTime} required /></label>
            <label>Grace (min)<input type="number" name="graceMinutes" defaultValue={s?.graceMinutes ?? 10} style={{ width: 70 }} /></label>
            <label>Full day (min)<input type="number" name="fullDayMinutes" defaultValue={s?.fullDayMinutes ?? 480} style={{ width: 80 }} /></label>
            <label>Half day (min)<input type="number" name="halfDayMinutes" defaultValue={s?.halfDayMinutes ?? 240} style={{ width: 80 }} /></label>
            <span className="muted">Off:{" "}
              {WEEKDAYS.map((w, i) => (
                <label key={w} style={{ display: "inline-flex", gap: 2 }}>
                  <input type="checkbox" name="weeklyOffs" value={i} defaultChecked={s ? s.weeklyOffs.includes(i) : i === 0} />{w}
                </label>
              ))}
            </span>
            <button className="secondary">{s ? "Save" : "Add shift"}</button>
          </form>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Holidays</h2>
        <table><tbody>{holidays.map((h) => <tr key={h.id}><td>{fmtDate(h.date)}</td><td>{h.name}</td></tr>)}</tbody></table>
        <form action={addHoliday} className="inline" style={{ marginTop: 8 }}>
          <label>Date<input type="date" name="date" required /></label>
          <label>Name<input name="name" required /></label>
          <button className="secondary">Add holiday</button>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Leave balance adjustment</h2>
        <p className="muted">Use for opening balances when you start, or corrections. Negative days reduce the balance.</p>
        {msg === "leave-adjusted" && <p>Leave balance updated.</p>}
        <form action={adjustLeave} className="inline">
          <label>Employee<select name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label>
          <label>Leave type<select name="leaveTypeId">{leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label>Days<input type="number" name="days" step="0.5" required style={{ width: 80 }} /></label>
          <label>Note<input name="note" placeholder="Opening balance" /></label>
          <button className="secondary">Save</button>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Departments</h2>
        <p>{departments.map((d) => d.name).join(", ") || "None yet"}</p>
        <form action={addDepartment} className="inline">
          <label>Name<input name="name" required /></label>
          <button className="secondary">Add department</button>
        </form>
      </div>
    </>
  );
}
