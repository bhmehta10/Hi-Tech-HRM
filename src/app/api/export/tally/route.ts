import { currentUser } from "@/lib/server/auth";
import { monthSummaries } from "@/lib/server/payroll-service";
import { toTallyCsv } from "@/lib/domain/payroll-export";
import { isMonth } from "@/components/format";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (user?.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month");
  if (!isMonth(month)) return new Response("month=YYYY-MM required", { status: 400 });
  const csv = toTallyCsv(await monthSummaries(month));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-inputs-${month}.csv"`,
    },
  });
}
