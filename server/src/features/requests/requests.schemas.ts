import { RequestStatus } from "@prisma/client";
import { z } from "zod";

// PostgreSQL int4: a larger ID cannot exist, and passing it to Prisma would fail with 500.
const MAX_ID = 2_147_483_647;

const POSITIVE = "Must be a positive integer";
const QUANTITY = "Must be an integer from 1 to 10";
const LOAN_DAYS = "Must be an integer from 1 to 365";

// validate() makes the top level strict; the line object is strict here (DD-09), so a unitId or
// assetTag in a line is an unknown field (BR-06).
const requestLine = z.strictObject({
  itemTypeId: z.number({ error: POSITIVE }).int({ error: POSITIVE }).positive({ error: POSITIVE }).max(MAX_ID, { error: POSITIVE }),
  // F04-D2: at most 10 per line; the item type's own maximum is a 409 rule (BR-07).
  quantity: z.number({ error: QUANTITY }).int({ error: QUANTITY }).min(1, { error: QUANTITY }).max(10, { error: QUANTITY }),
});

/**
 * Sprint 2 (contract F-04 3.4, F04-D1, F04-D2): 1 to 10 lines, each item type once, and one loan
 * length for the whole request. The limits that depend on data are checked by the service (DD-10).
 * F-05 uses the same schema for an edit (FR-11).
 */
export const createRequestBody = z.object({
  lines: z
    .array(requestLine, { error: "Must have 1 to 10 lines" })
    .min(1, { error: "Must have 1 to 10 lines" })
    .max(10, { error: "Must have 1 to 10 lines" })
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();
      lines.forEach((line, i) => {
        if (seen.has(line.itemTypeId))
          ctx.addIssue({ code: "custom", path: [i, "itemTypeId"], message: `Item type ${line.itemTypeId} is listed twice` });
        seen.add(line.itemTypeId);
      });
    }),
  loanDays: z.number({ error: LOAN_DAYS }).int({ error: LOAN_DAYS }).min(1, { error: LOAN_DAYS }).max(365, { error: LOAN_DAYS }),
});

export const listRequestsQuery = z
  .object({
    status: z.enum(RequestStatus).optional(),
    // F-11 5.2 (F11-D7): only `true`, and not together with `status`.
    overdue: z.literal("true", { error: "Only true is allowed" }).optional(),
  })
  .refine((q) => !(q.overdue && q.status), { error: "Cannot be combined with status", path: ["overdue"] });

export const requestIdParams = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: "Must be a positive integer" })
    .transform(Number)
    .pipe(z.number().max(MAX_ID, { error: "Must be a positive integer" })),
});

// validate() makes both strict, so any other field (for example lineIds) is an error (contract F-06 3.4).
/** Approve takes an empty body: a request is approved as a whole (BR-09). */
export const approveBody = z.object({});

/** Reject needs a reason the Borrower will see; trimmed, 1 to 500 characters (BR-09, F06-D3). */
export const rejectBody = z.object({
  reason: z
    .string({ error: "Must be a string" })
    .trim()
    .min(1, { error: "Must not be blank" })
    .max(500, { error: "Must be at most 500 characters" }),
});

/** Cancel takes an empty body (contract F-05 3.4); validate() makes it strict. */
export const cancelBody = z.object({});

export type RejectBody = z.infer<typeof rejectBody>;
export type CreateRequestBody = z.infer<typeof createRequestBody>;
export type ListRequestsQuery = z.infer<typeof listRequestsQuery>;
