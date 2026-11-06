// Units of an item type, for the checkout dialog (contract F-03 5.2, F03-D8).
import type { PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../core/errors.js";
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
  };
}
