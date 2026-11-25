// Units of an item type and the due-date preview, for the checkout dialog (contract F-03 5.2, 5.5).
import type { PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../core/errors.js";
import { computeDueAt } from "../../domain/due-date.js";
import type { ListUnitsQuery } from "./units.schemas.js";

export function unitsService(prisma: PrismaClient) {
  return {
    /** Every unit of the item type, or only those in `status`, ordered by asset tag. */
    async listForItemType(itemTypeId: number, query: ListUnitsQuery) {
      const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { id: true } });
      if (!itemType) throw new NotFoundError(`Item type ${itemTypeId} does not exist.`);
      return prisma.unit.findMany({
        where: { itemTypeId, ...(query.status ? { status: query.status } : {}) },
        orderBy: { assetTag: "asc" },
        select: { id: true, assetTag: true, status: true },
      });
    },

    /** The due date a checkout at `now` would get (D-21). Read only (contract F-03 5.5, #71). */
    async dueDatePreview(itemTypeId: number, now: Date = new Date()) {
      const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { id: true, maxLoanDays: true } });
      if (!itemType) throw new NotFoundError(`Item type ${itemTypeId} does not exist.`);
      return {
        itemTypeId: itemType.id,
        maxLoanDays: itemType.maxLoanDays,
        at: now.toISOString(),
        dueAt: computeDueAt(now, itemType.maxLoanDays).toISOString(),
      };
    },
  };
}
