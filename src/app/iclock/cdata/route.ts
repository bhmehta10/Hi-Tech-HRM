// eSSL / ZKTeco push (ADMS) endpoint.
// GET  /iclock/cdata?SN=...&options=all        -> handshake / options
// POST /iclock/cdata?SN=...&table=ATTLOG&Stamp= -> attendance logs
import { prisma } from "@/lib/server/db";
import { authoriseDevice, text } from "@/lib/server/device-service";
import { handshakeResponse, parseAttlog } from "@/lib/domain/essl";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const device = await authoriseDevice(url.searchParams.get("SN"));
  if (!device) return text("Unknown device", 403);
  return text(handshakeResponse(device.serial, device.attStamp));
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const device = await authoriseDevice(url.searchParams.get("SN"));
  if (!device) return text("Unknown device", 403);
  const table = url.searchParams.get("table");
  const body = await req.text();
  if (table !== "ATTLOG") return text("OK"); // OPERLOG, ATTPHOTO, user data: acknowledged, not stored

  const { punches, rejected } = parseAttlog(body);
  if (rejected.length) console.warn(`[iclock] ${device.serial}: ${rejected.length} unparsable lines`);
  const result = await prisma.rawPunch.createMany({
    data: punches.map((p) => ({ deviceSerial: device.serial, source: "device", ...p })),
    skipDuplicates: true, // devices resend logs after reconnecting
  });
  const stamp = url.searchParams.get("Stamp");
  if (stamp) await prisma.device.update({ where: { id: device.id }, data: { attStamp: stamp } });
  console.info(`[iclock] ${device.serial}: ${punches.length} received, ${result.count} new`);
  return text(`OK: ${punches.length}`);
}
