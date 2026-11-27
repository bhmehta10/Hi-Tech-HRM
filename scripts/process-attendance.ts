// Manual re-run: npm run attendance:process -- 2026-11-01 2026-11-30
import { processRange } from "../src/lib/server/attendance-service";
import { todayIst } from "../src/lib/domain/time";
import { prisma } from "../src/lib/server/db";

const [from = todayIst(), to = from] = process.argv.slice(2);
processRange(from, to)
  .then(() => console.log(`Processed ${from} to ${to}`))
  .finally(() => prisma.$disconnect());
