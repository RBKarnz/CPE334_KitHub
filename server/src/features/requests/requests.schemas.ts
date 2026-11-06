import { RequestStatus } from "@prisma/client";
import { z } from "zod";

// PostgreSQL int4: a larger ID cannot exist, and passing it to Prisma would fail with 500.
const MAX_ID = 2_147_483_647;

// validate() makes the top level strict; the line object is strict here (DD-09).
const requestLine = z.strictObject({
  itemTypeId: z.number().int().positive().max(MAX_ID),
  quantity: z.literal(1, { error: "Must be 1" }),
});

/** Sprint 1: exactly one line with quantity 1 (contract F-02 4.2, DD-11). */
export const createRequestBody = z.object({
  lines: z.array(requestLine).length(1, { error: "Sprint 1 allows exactly one line" }),
});

export const listRequestsQuery = z.object({
  status: z.enum(RequestStatus).optional(),
});

export const requestIdParams = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: "Must be a positive integer" })
    .transform(Number)
    .pipe(z.number().max(MAX_ID, { error: "Must be a positive integer" })),
});

export type CreateRequestBody = z.infer<typeof createRequestBody>;
export type ListRequestsQuery = z.infer<typeof listRequestsQuery>;
