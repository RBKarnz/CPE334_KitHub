// Units of an item type and the due-date preview, for the checkout dialog (contract F-03 5.2, 5.5);
// add, repair and retire a unit (contract F-09 3, 5.3).
import { ActorType, HistoryEntity, Prisma, UnitStatus, type PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../core/middleware/authenticate.js";
import { ConflictError, NotFoundError } from "../../core/errors.js";
import { computeDueAt } from "../../domain/due-date.js";
import { assertTransition } from "../../domain/transitions.js";
import { assetTagTaken, isAssetTagViolation } from "../catalog/catalog-errors.js";
import type { ListUnitsQuery } from "./units.schemas.js";

/** The unit representation of the F-09 endpoints (F09-D9). */
const managedUnitSelect = {
  id: true,
  assetTag: true,
  status: true,
  itemType: { select: { id: true, name: true } },
} satisfies Prisma.UnitSelect;

/** What each F-09 status change needs: the state it starts from and its 409 message. */
const CHANGES = {
  repair: {
    to: UnitStatus.AVAILABLE,
    from: [UnitStatus.MAINTENANCE] as UnitStatus[],
    message: (tag: string, status: string) => `Unit ${tag} cannot be marked repaired because it is ${status}, not MAINTENANCE.`,
  },
  retire: {
    to: UnitStatus.RETIRED,
    from: [UnitStatus.AVAILABLE, UnitStatus.MAINTENANCE] as UnitStatus[],
    message: (tag: string, status: string) => `Unit ${tag} cannot be retired because it is ${status}.`,
  },
};

export function unitsService(prisma: PrismaClient) {
  /**
   * Repair (MAINTENANCE → AVAILABLE, BR-11) or retire (AVAILABLE or MAINTENANCE → RETIRED, BR-12)
   * in one transaction with one history entry (contract F-09 3.6). The row is locked first, so the
   * state read is the one the conditional update sees and a racing checkout waits (3.7).
   */
  async function changeStatus(user: AuthUser, unitId: number, change: keyof typeof CHANGES) {
    const { to, from, message } = CHANGES[change];
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const [unit] = await tx.$queryRaw<{ assetTag: string; status: UnitStatus }[]>`
        SELECT "assetTag", status::text AS status FROM units WHERE id = ${unitId} FOR UPDATE`;
      if (!unit) throw new NotFoundError(`Unit ${unitId} does not exist.`);
      if (!from.includes(unit.status)) throw new ConflictError("INVALID_STATE", message(unit.assetTag, unit.status));
      assertTransition("UNIT", unit.status, to);

      const moved = await tx.unit.updateMany({ where: { id: unitId, status: { in: from } }, data: { status: to } });
      if (moved.count === 0) {
        // Not reached while the row lock is held; kept as the SDS 4.7 guard.
        const current = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, select: { status: true } });
        throw new ConflictError("INVALID_STATE", message(unit.assetTag, current.status));
      }
      await tx.historyEntry.create({
        data: {
          occurredAt: now,
          actorType: ActorType.USER,
          actorUserId: user.id,
          entityType: HistoryEntity.UNIT,
          unitId,
          action: "STATUS_CHANGED",
          fromStatus: unit.status,
          toStatus: to,
        },
      });
      return tx.unit.findUniqueOrThrow({ where: { id: unitId }, select: managedUnitSelect });
    });
  }

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

    /**
     * The due date a checkout at `now` would get (D-21). Read only (contract F-03 5.5, #71). With
     * `days` (F07-D4) that loan length is used, also above the item type's maximum; the response
     * still reports the item type's maxLoanDays.
     */
    async dueDatePreview(itemTypeId: number, days?: number, now: Date = new Date()) {
      const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { id: true, maxLoanDays: true } });
      if (!itemType) throw new NotFoundError(`Item type ${itemTypeId} does not exist.`);
      return {
        itemTypeId: itemType.id,
        maxLoanDays: itemType.maxLoanDays,
        at: now.toISOString(),
        dueAt: computeDueAt(now, days ?? itemType.maxLoanDays).toISOString(),
      };
    },

    /**
     * POST /item-types/:id/units (FR-24): a new AVAILABLE unit and one CREATED history entry, in
     * one transaction. The asset tag is unique across all item types (A-07); a tag added at the
     * same moment by another call is caught by the unique index (F09-D11).
     */
    async addUnit(user: AuthUser, itemTypeId: number, assetTag: string) {
      const itemType = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { id: true } });
      if (!itemType) throw new NotFoundError(`Item type ${itemTypeId} does not exist.`);
      if (await prisma.unit.findUnique({ where: { assetTag }, select: { id: true } })) throw assetTagTaken(assetTag);

      assertTransition("UNIT", null, UnitStatus.AVAILABLE);
      try {
        return await prisma.$transaction(async (tx) => {
          const now = new Date();
          const unit = await tx.unit.create({
            data: { itemTypeId, assetTag, status: UnitStatus.AVAILABLE },
            select: managedUnitSelect,
          });
          await tx.historyEntry.create({
            data: {
              occurredAt: now,
              actorType: ActorType.USER,
              actorUserId: user.id,
              entityType: HistoryEntity.UNIT,
              unitId: unit.id,
              action: "CREATED",
              toStatus: UnitStatus.AVAILABLE,
              details: { assetTag },
            },
          });
          return unit;
        });
      } catch (err) {
        if (isAssetTagViolation(err)) throw assetTagTaken(assetTag);
        throw err;
      }
    },

    /** POST /units/:id/repair (FR-25): MAINTENANCE → AVAILABLE. */
    repair: (user: AuthUser, unitId: number) => changeStatus(user, unitId, "repair"),

    /** POST /units/:id/retire (FR-26): AVAILABLE or MAINTENANCE → RETIRED; never ON_LOAN (BR-12). */
    retire: (user: AuthUser, unitId: number) => changeStatus(user, unitId, "retire"),
  };
}
