// Catalog with available counts (contract F-02 4.1, FR-04).
import { UnitStatus, type PrismaClient } from "@prisma/client";

export function catalogService(prisma: PrismaClient) {
  return {
    /** Categories and item types by name (F02-D3). No unit IDs or asset tags (F02-D7). */
    async listCategories() {
      const [categories, available] = await Promise.all([
        prisma.category.findMany({
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            itemTypes: {
              orderBy: [{ name: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                description: true,
                isKit: true,
                maxLoanDays: true,
                maxQuantityPerRequest: true,
              },
            },
          },
        }),
        // One grouped count on units (itemTypeId, status), never stored (DD-08).
        prisma.unit.groupBy({ by: ["itemTypeId"], where: { status: UnitStatus.AVAILABLE }, _count: { _all: true } }),
      ]);

      const availableByType = new Map(available.map((row) => [row.itemTypeId, row._count._all]));
      return categories.map((category) => ({
        ...category,
        itemTypes: category.itemTypes.map((t) => ({ ...t, availableCount: availableByType.get(t.id) ?? 0 })),
      }));
    },
  };
}
