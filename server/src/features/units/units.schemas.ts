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
