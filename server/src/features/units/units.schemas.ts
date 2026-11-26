import { UnitStatus } from "@prisma/client";
import { z } from "zod";

const MAX_ID = 2_147_483_647;

export const itemTypeIdParams = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: "Must be a positive integer" })
    .transform(Number)
    .pipe(z.number().max(MAX_ID, { error: "Must be a positive integer" })),
});

// validate() makes this strict, so an unknown query field is an error (contract F-03 5.2).
export const listUnitsQuery = z.object({
  status: z
    .enum(UnitStatus, { error: `Must be one of ${Object.values(UnitStatus).join(", ")}` })
    .optional(),
});

export type ListUnitsQuery = z.infer<typeof listUnitsQuery>;

// The due-date preview takes only an optional `days`, an integer 1 to 365 (contract F-07 5.3,
// F07-D4); validate() makes this strict, so any other field is an error (F-03 5.5, #71).
export const dueDatePreviewQuery = z.object({
  days: z
    .string()
    .regex(/^[1-9]\d*$/, { error: "Must be an integer from 1 to 365" })
    .transform(Number)
    .pipe(z.number().max(365, { error: "Must be an integer from 1 to 365" }))
    .optional(),
});

export type DueDatePreviewQuery = z.infer<typeof dueDatePreviewQuery>;

/** Path `id` of a unit (contract F-09 3.4). */
export const unitIdParams = itemTypeIdParams;

/** Add unit (contract F-09 3.4, F09-D6): trimmed, upper-cased, then KH-<CODE>-<NNNN>. */
export const addUnitBody = z.object({
  assetTag: z
    .string({ error: "Must be a string" })
    .trim()
    .toUpperCase()
    .regex(/^KH-[A-Z0-9]{2,6}-[0-9]{4}$/, { error: "Must look like KH-ARD-0007" }),
});

/** Repair and retire take exactly {}; validate() makes it strict (contract F-09 3.4). */
export const emptyBody = z.object({});

export type AddUnitBody = z.infer<typeof addUnitBody>;
