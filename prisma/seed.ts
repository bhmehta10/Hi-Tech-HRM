// Creates the default shift, leave types and the first admin login.
// Run once after the first migration: npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const shift = await prisma.shift.upsert({
    where: { name: "General" },
    create: { name: "General", startTime: "09:30", endTime: "18:30", graceMinutes: 10, fullDayMinutes: 480, halfDayMinutes: 240, weeklyOffs: [0] },
    update: {},
  });

  // Typical small-company policy; adjust quotas on the database or in a later admin screen.
  const leaveTypes = [
    { code: "CL", name: "Casual leave", annualQuota: 8, paid: true, carryForward: false },
    { code: "SL", name: "Sick leave", annualQuota: 7, paid: true, carryForward: false },
    { code: "EL", name: "Earned leave", annualQuota: 15, paid: true, carryForward: true },
    { code: "LWP", name: "Leave without pay", annualQuota: 0, paid: false, carryForward: false },
  ];
  for (const t of leaveTypes) await prisma.leaveType.upsert({ where: { code: t.code }, create: t, update: {} });

  const code = process.env.ADMIN_CODE ?? "ADMIN";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set ADMIN_PASSWORD (8+ characters) before seeding");
  await prisma.employee.upsert({
    where: { code },
    create: {
      code, name: process.env.ADMIN_NAME ?? "HR Admin", role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 10),
      joinDate: new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`), shiftId: shift.id,
    },
    update: {},
  });
  console.log(`Seeded. Sign in as ${code}.`);
}

main().finally(() => prisma.$disconnect());
