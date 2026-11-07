import { z } from "zod";

// PostgreSQL int4: a larger ID cannot exist, and passing it to Prisma would fail with 500.
const MAX_ID = 2_147_483_647;
const id = z.number().int().positive().max(MAX_ID);

// validate() makes the top level strict; each entry is strict here (DD-09).
const checkoutEntry = z.strictObject({ lineId: id, unitId: id });

/** Sprint 1: exactly one entry, because every request has one line of quantity 1 (contract F-03 3.5, DD-11). */
export const checkoutBody = z.object({
  units: z.array(checkoutEntry).length(1, { error: "Must contain exactly 1 entry" }),
});

export type CheckoutBody = z.infer<typeof checkoutBody>;
