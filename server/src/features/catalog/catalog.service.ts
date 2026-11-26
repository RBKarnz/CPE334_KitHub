// Catalog with available counts (contract F-02 4.1, FR-04) and its management by Custodians:
// categories and item types (contract F-09 3, 5.1, 5.2).
import { Prisma, UnitStatus, type PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../core/errors.js";
import { isNameViolation, nameTaken } from "./catalog-errors.js";
import type { CreateCategoryBody, CreateItemTypeBody, EditCategoryBody, EditItemTypeBody } from "./catalog.schemas.js";

/** The category representation (F09-D9). */
const categorySelect = {
  id: true,
  name: true,
  description: true,
  defaultMaxLoanDays: true,
  defaultMaxQuantity: true,
} satisfies Prisma.CategorySelect;

const itemTypeSelect = {
  id: true,
  name: true,
  description: true,
  isKit: true,
  maxLoanDays: true,
  maxQuantityPerRequest: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ItemTypeSelect;

type Kind = "category" | "item type";
const TABLE: Record<Kind, Prisma.Sql> = { category: Prisma.sql`categories`, "item type": Prisma.sql`item_types` };

export function catalogService(prisma: PrismaClient) {
  /**
   * The stored name that equals `name` without regard to case, ignoring the record `exceptId`
   * (F09-D2: an edit may resend its own name or change only its letter case). Uses lower(name),
   * the same expression as the unique indexes of F09-D11.
   */
  async function nameInUse(kind: Kind, name: string, exceptId?: number): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM ${TABLE[kind]} WHERE lower(name) = lower(${name}) AND id <> ${exceptId ?? 0} LIMIT 1`;
    return rows[0]?.name ?? null;
  }

  async function assertNameFree(kind: Kind, name: string | undefined, exceptId?: number) {
    if (name === undefined) return;
    const taken = await nameInUse(kind, name, exceptId);
    if (taken !== null) throw nameTaken(kind, taken);
  }

  /**
   * Runs a write; a P2002 on a name index (a create or rename that raced another one, 3.7) becomes
   * 409 NAME_TAKEN naming the stored record. Any other error is rethrown unchanged.
   */
  async function writeName<T>(kind: Kind, name: string | undefined, exceptId: number | undefined, write: () => Promise<T>) {
    try {
      return await write();
    } catch (err) {
      if (name === undefined || !isNameViolation(err)) throw err;
      throw nameTaken(kind, (await nameInUse(kind, name, exceptId)) ?? name);
    }
  }

  async function findCategory(id: number, field?: string) {
    const category = await prisma.category.findUnique({ where: { id }, select: categorySelect });
    if (!category)
      throw new NotFoundError(`Category ${id} does not exist.`, field ? [{ field, issue: "Category does not exist" }] : undefined);
    return category;
  }

  /** The item type as F04-D6: with its available count and category. */
  async function itemTypeView(id: number) {
    const [itemType, availableCount] = await Promise.all([
      prisma.itemType.findUniqueOrThrow({ where: { id }, select: itemTypeSelect }),
      prisma.unit.count({ where: { itemTypeId: id, status: UnitStatus.AVAILABLE } }),
    ]);
    const { category, ...rest } = itemType;
    return { ...rest, availableCount, category };
  }

  return {
    /** Categories and item types by name (F02-D3). No unit IDs or asset tags (F02-D7). */
    async listCategories() {
      const [categories, available] = await Promise.all([
        prisma.category.findMany({
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: {
            ...categorySelect,
            itemTypes: {
              orderBy: [{ name: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                description: true,
                isKit: true,
                maxLoanDays: true,
                maxQuantityPerRequest: true,
              },
            },
          },
        }),
        // One grouped count on units (itemTypeId, status), never stored (DD-08).
        prisma.unit.groupBy({ by: ["itemTypeId"], where: { status: UnitStatus.AVAILABLE }, _count: { _all: true } }),
      ]);

      const availableByType = new Map(available.map((row) => [row.itemTypeId, row._count._all]));
      return categories.map((category) => ({
        ...category,
        itemTypes: category.itemTypes.map((t) => ({ ...t, availableCount: availableByType.get(t.id) ?? 0 })),
      }));
    },

    /** GET /item-types/:id (contract F-04 5.1, F04-D6): the same for both roles, no units. */
    async getItemType(id: number) {
      const exists = await prisma.itemType.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError(`Item type ${id} does not exist.`);
      return itemTypeView(id);
    },

    /** POST /categories (F-09 5.1). No history entry (F09-D8). */
    async createCategory(body: CreateCategoryBody) {
      await assertNameFree("category", body.name);
      return writeName("category", body.name, undefined, () =>
        prisma.category.create({
          data: {
            name: body.name,
            description: body.description ?? null,
            defaultMaxLoanDays: body.defaultMaxLoanDays,
            defaultMaxQuantity: body.defaultMaxQuantity,
          },
          select: categorySelect,
        }),
      );
    },

    /** PATCH /categories/:id: only the sent fields change; item types keep their limits (F09-D4). */
    async editCategory(id: number, body: EditCategoryBody) {
      await findCategory(id);
      await assertNameFree("category", body.name, id);
      return writeName("category", body.name, id, () => prisma.category.update({ where: { id }, data: body, select: categorySelect }));
    },

    /** POST /item-types (F-09 5.2): limits left out are copied from the category (F09-D4). */
    async createItemType(body: CreateItemTypeBody) {
      const category = await findCategory(body.categoryId, "categoryId");
      await assertNameFree("item type", body.name);
      const created = await writeName("item type", body.name, undefined, () =>
        prisma.itemType.create({
          data: {
            categoryId: category.id,
            name: body.name,
            description: body.description ?? "",
            isKit: body.isKit ?? false,
            maxLoanDays: body.maxLoanDays ?? category.defaultMaxLoanDays,
            maxQuantityPerRequest: body.maxQuantityPerRequest ?? category.defaultMaxQuantity,
          },
          select: { id: true },
        }),
      );
      return itemTypeView(created.id);
    },

    /**
     * PATCH /item-types/:id: only the sent fields change. A move to another category keeps the
     * limits (F09-D7); open requests are not re-checked (F09-D5).
     */
    async editItemType(id: number, body: EditItemTypeBody) {
      const exists = await prisma.itemType.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError(`Item type ${id} does not exist.`);
      if (body.categoryId !== undefined) await findCategory(body.categoryId, "categoryId");
      await assertNameFree("item type", body.name, id);
      await writeName("item type", body.name, id, () => prisma.itemType.update({ where: { id }, data: body, select: { id: true } }));
      return itemTypeView(id);
    },
  };
}
