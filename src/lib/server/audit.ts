import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export function audit(actorId: number | null, action: string, entity: string, entityId?: string | number, detail?: Prisma.InputJsonValue) {
  return prisma.auditLog.create({
    data: { actorId, action, entity, entityId: entityId === undefined ? null : String(entityId), detail },
  });
}
