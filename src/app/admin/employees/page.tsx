import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { hashPassword, requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { dateOnly } from "@/lib/domain/time";
import { fmtDate } from "@/components/format";

export const dynamic = "force-dynamic";

const NewEmployee = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deviceUserId: z.string().trim().optional().transform((v) => v || undefined),
  shiftId: z.coerce.number().int(),
  departmentId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
  managerId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
  password: z.string().min(8),
});

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireUser(["ADMIN"]);
  const { msg } = await searchParams;
  const [employees, shifts, departments] = await Promise.all([
    prisma.employee.findMany({ include: { shift: true, department: true, manager: true }, orderBy: { code: "asc" } }),
    prisma.shift.findMany(),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function addEmployee(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN"]);
    const parsed = NewEmployee.safeParse(Object.fromEntries(form));
    if (!parsed.success) redirect("/admin/employees?msg=invalid");
    const { password, joinDate, ...rest } = parsed.data;
    try {
      const e = await prisma.employee.create({
        data: { ...rest, joinDate: dateOnly(joinDate), passwordHash: await hashPassword(password) },
      });
      await audit(u.id, "create", "Employee", e.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") redirect("/admin/employees?msg=duplicate");
      throw err;
    }
    revalidatePath("/admin/employees");
    redirect("/admin/employees?msg=added");
  }

  async function toggleActive(form: FormData) {
    "use server";
    const u = await requireUser(["ADMIN"]);
    const id = Number(form.get("id"));
    const e = await prisma.employee.findUniqueOrThrow({ where: { id } });
    if (e.id === u.id) return;
    await prisma.employee.update({ where: { id }, data: { active: !e.active } });
    await audit(u.id, e.active ? "deactivate" : "activate", "Employee", id);
    revalidatePath("/admin/employees");
  }

  return (
    <>
      <h1>Employees ({employees.filter((e) => e.active).length} active)</h1>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Role</th><th>Department</th><th>Shift</th><th>Manager</th><th>Device ID</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} style={e.active ? undefined : { opacity: 0.5 }}>
                <td>{e.code}</td><td>{e.name}</td><td>{e.role}</td><td>{e.department?.name ?? "–"}</td><td>{e.shift.name}</td>
                <td>{e.manager?.name ?? "–"}</td><td>{e.deviceUserId ?? <span className="error">not linked</span>}</td><td>{fmtDate(e.joinDate)}</td>
                <td><form action={toggleActive}><input type="hidden" name="id" value={e.id} /><button className="secondary">{e.active ? "Deactivate" : "Activate"}</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add employee</h2>
        {msg === "added" && <p>Employee added.</p>}
        {msg === "invalid" && <p className="error">Please check the fields. Password needs 8+ characters.</p>}
        {msg === "duplicate" && <p className="error">That code, email or device ID is already used.</p>}
        <form action={addEmployee} className="stack">
          <label>Employee code<input name="code" required /></label>
          <label>Full name<input name="name" required /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Phone<input name="phone" /></label>
          <label>Device user ID (as enrolled on the eSSL device)<input name="deviceUserId" /></label>
          <label>Joining date<input name="joinDate" type="date" required /></label>
          <label>Role<select name="role" defaultValue="EMPLOYEE"><option>EMPLOYEE</option><option>MANAGER</option><option>ADMIN</option></select></label>
          <label>Shift<select name="shiftId">{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}</select></label>
          <label>Department<select name="departmentId"><option value="">–</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Reports to<select name="managerId"><option value="">–</option>{employees.filter((e) => e.active && e.role !== "EMPLOYEE").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label>Temporary password<input name="password" type="password" minLength={8} required /></label>
          <button type="submit">Add employee</button>
        </form>
      </div>
    </>
  );
}
