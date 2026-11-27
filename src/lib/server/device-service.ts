import { prisma } from "./db";

/**
 * Known devices only, so strangers cannot post punches. Add a device's serial
 * number on the Devices page, or set DEVICE_AUTO_REGISTER=true while installing.
 */
export async function authoriseDevice(serial: string | null) {
  if (!serial) return null;
  const existing = await prisma.device.findUnique({ where: { serial } });
  if (existing) {
    return prisma.device.update({ where: { serial }, data: { lastSeenAt: new Date() } });
  }
  if (process.env.DEVICE_AUTO_REGISTER === "true") {
    return prisma.device.create({ data: { serial, name: `Auto ${serial}`, lastSeenAt: new Date() } });
  }
  return null;
}

export function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}
