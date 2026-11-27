import { authoriseDevice, text } from "@/lib/server/device-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const device = await authoriseDevice(new URL(req.url).searchParams.get("SN"));
  return device ? text("OK") : text("Unknown device", 403);
}
