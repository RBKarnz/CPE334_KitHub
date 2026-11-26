import { z } from "zod";

// PostgreSQL int4: a larger ID cannot exist, and passing it to Prisma would fail with 500.
const MAX_ID = 2_147_483_647;

// GET /api/categories takes no query parameter; validate() makes this strict (DD-09).
export const catalogQuery = z.object({});

/** Path `id` of a category or item type (contract F-09 3.4). */
export const recordIdParams = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, { error: "Must be a positive integer" })
    .transform(Number)
    .pipe(z.number().max(MAX_ID, { error: "Must be a positive integer" })),
});

const intBetween = (min: number, max: number) => {
  const error = `Must be an integer from ${min} to ${max}`;
  return z.number({ error }).int({ error }).min(min, { error }).max(max, { error });
};

// Bounds of contract F-09 3.4 and F09-D3: loan days 1 to 365, quantity 1 to 10 (F04-D2).
const loanDays = intBetween(1, 365);
const quantity = intBetween(1, 10);

/** Trimmed, 1 to 100 characters (F09-D2). */
const name = z
  .string({ error: "Must be a string" })
  .trim()
  .min(1, { error: "Must not be blank" })
  .max(100, { error: "Must be at most 100 characters" });

/** A category description: up to 1000 characters or null; empty after trimming becomes null. */
const categoryDescription = z
  .string({ error: "Must be a string or null" })
  .trim()
  .max(1000, { error: "Must be at most 1000 characters" })
  .transform((v) => (v === "" ? null : v))
  .nullable();

/** An item type description may be empty (SDS 4.2); up to 1000 characters. */
const itemTypeDescription = z
  .string({ error: "Must be a string" })
  .trim()
  .max(1000, { error: "Must be at most 1000 characters" });

const atLeastOne = (body: object) => Object.keys(body).length > 0;
const AT_LEAST_ONE = { error: "At least one field is required" };

// Strict objects: validate() would make the top level strict, but the edit schemas are refined,
// so they are made strict here before .partial() and .refine() (DD-09).
const categoryFields = z.strictObject({
  name,
  description: categoryDescription.optional(),
  defaultMaxLoanDays: loanDays,
  defaultMaxQuantity: quantity,
});

export const createCategoryBody = categoryFields;
export const editCategoryBody = categoryFields.partial().refine(atLeastOne, AT_LEAST_ONE);

const itemTypeFields = z.strictObject({
  categoryId: z
    .number({ error: "Must be a positive integer" })
    .int({ error: "Must be a positive integer" })
    .positive({ error: "Must be a positive integer" })
    .max(MAX_ID, { error: "Must be a positive integer" }),
  name,
  description: itemTypeDescription.optional(),
  isKit: z.boolean({ error: "Must be true or false" }).optional(),
  maxLoanDays: loanDays.optional(),
  maxQuantityPerRequest: quantity.optional(),
});

export const createItemTypeBody = itemTypeFields;
export const editItemTypeBody = itemTypeFields.partial().refine(atLeastOne, AT_LEAST_ONE);

export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export type EditCategoryBody = z.infer<typeof editCategoryBody>;
export type CreateItemTypeBody = z.infer<typeof createItemTypeBody>;
export type EditItemTypeBody = z.infer<typeof editItemTypeBody>;
