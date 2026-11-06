// Errors specific to checkout (contract F-03 3.6, 3.9, F03-D3).
import { Prisma } from "@prisma/client";
import { ConflictError } from "../../core/errors.js";

export const UNIT_FIELD = "units[0].unitId";
export const LINE_FIELD = "units[0].lineId";

export const unitNotAvailable = (assetTag: string, issue: string) =>
  new ConflictError("UNIT_NOT_AVAILABLE", `Unit ${assetTag} is not available for checkout.`, [
    { field: UNIT_FIELD, issue },
  ]);

/**
 * The SR-01 handler answers any unique violation with the generic 409 CONFLICT. On the loan
 * insert, the only unique constraints are the primary key and loans_one_active_per_unit, so a
 * P2002 there means the unit already has an ACTIVE loan: 409 UNIT_NOT_AVAILABLE (BR-03).
 * Any other error is returned unchanged, for the caller to rethrow.
 */
export function toLoanInsertConflict(err: unknown, unit: { id: number; assetTag: string }): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    return unitNotAvailable(unit.assetTag, "Unit already has an active loan");
  return err;
}
