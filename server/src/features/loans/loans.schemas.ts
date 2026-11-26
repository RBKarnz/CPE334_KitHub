import { LoanStatus } from "@prisma/client";
import { z } from "zod";

// PostgreSQL int4: a larger ID cannot exist, and passing it to Prisma would fail with 500.
const MAX_ID = 2_147_483_647;
const id = z.number().int().positive().max(MAX_ID);

// validate() makes the top level strict; each entry is strict here (DD-09).
const checkoutEntry = z.strictObject({ lineId: id, unitId: id });

/**
 * 1 to 100 entries (contract F-07 3.4): at most 10 lines × 10 per line (F04-D2). The bound only
 * limits the body size; the service checks that each line gets exactly its quantity.
 */
export const checkoutBody = z.object({
  units: z
    .array(checkoutEntry)
    .min(1, { error: "Must contain at least 1 entry" })
    .max(100, { error: "Must contain at most 100 entries" }),
});

/** GET /loans: strict, `status` ACTIVE (default) or RETURNED (contract F-07 3.4). */
export const listLoansQuery = z.object({
  status: z
    .enum([LoanStatus.ACTIVE, LoanStatus.RETURNED], { error: "Must be one of ACTIVE, RETURNED" })
    .optional(),
});

export type ListLoansQuery = z.infer<typeof listLoansQuery>;

export type CheckoutBody = z.infer<typeof checkoutBody>;
