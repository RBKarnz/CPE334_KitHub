// Inventory summary report (contract F-14 3.3, 5.1). Read only: one read transaction and one `now`
// for every figure (F14-D1).
import { LoanStatus, Prisma, RequestStatus, UnitStatus, type PrismaClient } from "@prisma/client";

const COUNTS = ["available", "onLoan", "maintenance", "retired", "totalUnits", "activeLoans", "overdueRequests"] as const;
type Counts = Record<(typeof COUNTS)[number], number>;

const COLUMN: Record<UnitStatus, keyof Counts> = {
  [UnitStatus.AVAILABLE]: "available",
  [UnitStatus.ON_LOAN]: "onLoan",
  [UnitStatus.MAINTENANCE]: "maintenance",
  [UnitStatus.RETIRED]: "retired",
};

const zero = (): Counts => ({ available: 0, onLoan: 0, maintenance: 0, retired: 0, totalUnits: 0, activeLoans: 0, overdueRequests: 0 });

export function reportsService(prisma: PrismaClient) {
  return {
    async inventory() {
      const now = new Date();
      const [itemTypes, units, loans] = await prisma.$transaction(
        [
          // Every item type, also one with no unit, in the catalog's order (F14-D2).
          prisma.itemType.findMany({
            select: { id: true, name: true, category: { select: { id: true, name: true } } },
            orderBy: [{ category: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
          }),
          prisma.unit.groupBy({ by: ["itemTypeId", "status"], _count: { _all: true }, orderBy: { itemTypeId: "asc" } }),
          prisma.loan.findMany({
            where: { status: LoanStatus.ACTIVE },
            select: { dueAt: true, unit: { select: { itemTypeId: true } }, requestLine: { select: { request: { select: { id: true, status: true } } } } },
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );

      const rows = new Map(itemTypes.map((t) => [t.id, { counts: zero(), overdue: new Set<number>() }]));
      for (const u of units) {
        const row = rows.get(u.itemTypeId);
        if (!row) continue;
        const n = (u._count as { _all: number })._all;
        row.counts[COLUMN[u.status]] += n;
        row.counts.totalUnits += n;
      }
      // Overdue (F11-D1): a CHECKED_OUT request with an ACTIVE loan whose dueAt is before now.
      const allOverdue = new Set<number>();
      for (const loan of loans) {
        const row = rows.get(loan.unit.itemTypeId);
        if (!row) continue;
        row.counts.activeLoans += 1;
        const request = loan.requestLine.request;
        if (request.status === RequestStatus.CHECKED_OUT && loan.dueAt < now) {
          row.overdue.add(request.id);
          allOverdue.add(request.id);
        }
      }

      const totals = zero();
      const items = itemTypes.map((t) => {
        const row = rows.get(t.id)!;
        row.counts.overdueRequests = row.overdue.size;
        for (const k of COUNTS) if (k !== "overdueRequests") totals[k] += row.counts[k];
        return { itemType: { id: t.id, name: t.name }, category: t.category, ...row.counts };
      });
      // A request overdue in two item types counts once (F14-D3).
      totals.overdueRequests = allOverdue.size;
      return { generatedAt: now.toISOString(), items, totals };
    },
  };
}
