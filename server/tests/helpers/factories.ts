// Small factories that later feature tests reuse. Tests create their own data and do not
// depend on the demo seed (SDS 4.8).
import bcrypt from "bcryptjs";
import { Role, UnitStatus, type PrismaClient } from "@prisma/client";

/** Test-only password. It exists only in test code and is never a real account password. */
export const TEST_PASSWORD = "test-only-password";

// Lowest bcrypt cost, to keep tests fast. Computed once.
let testPasswordHash: Promise<string> | undefined;
const hashTestPassword = () => (testPasswordHash ??= bcrypt.hash(TEST_PASSWORD, 4));

let counter = 0;
const next = () => ++counter;

export async function createUser(
  prisma: PrismaClient,
  overrides: { username?: string; displayName?: string; role?: Role } = {},
) {
  const n = next();
  return prisma.user.create({
    data: {
      username: overrides.username ?? `user${n}`,
      displayName: overrides.displayName ?? `Test User ${n}`,
      role: overrides.role ?? Role.BORROWER,
      passwordHash: await hashTestPassword(),
    },
  });
}

export const createBorrower = (prisma: PrismaClient, overrides: { username?: string; displayName?: string } = {}) =>
  createUser(prisma, { ...overrides, role: Role.BORROWER });

export const createCustodian = (prisma: PrismaClient, overrides: { username?: string; displayName?: string } = {}) =>
  createUser(prisma, { ...overrides, role: Role.CUSTODIAN });

export async function createCategory(
  prisma: PrismaClient,
  overrides: { name?: string; defaultMaxLoanDays?: number; defaultMaxQuantity?: number } = {},
) {
  const n = next();
  return prisma.category.create({
    data: {
      name: overrides.name ?? `Test category ${n}`,
      defaultMaxLoanDays: overrides.defaultMaxLoanDays ?? 14,
      defaultMaxQuantity: overrides.defaultMaxQuantity ?? 2,
    },
  });
}

/** Creates an item type; creates a category for it when none is given. Limits copy the category's. */
export async function createItemType(
  prisma: PrismaClient,
  overrides: {
    categoryId?: number;
    name?: string;
    description?: string;
    maxLoanDays?: number;
    maxQuantityPerRequest?: number;
    isKit?: boolean;
  } = {},
) {
  const category = overrides.categoryId
    ? await prisma.category.findUniqueOrThrow({ where: { id: overrides.categoryId } })
    : await createCategory(prisma);
  const n = next();
  return prisma.itemType.create({
    data: {
      categoryId: category.id,
      name: overrides.name ?? `Test item type ${n}`,
      description: overrides.description ?? "",
      maxLoanDays: overrides.maxLoanDays ?? category.defaultMaxLoanDays,
      maxQuantityPerRequest: overrides.maxQuantityPerRequest ?? category.defaultMaxQuantity,
      isKit: overrides.isKit ?? false,
    },
  });
}

/** Creates a unit; creates an item type for it when none is given. */
export async function createUnit(
  prisma: PrismaClient,
  overrides: { itemTypeId?: number; assetTag?: string; status?: UnitStatus } = {},
) {
  const itemTypeId = overrides.itemTypeId ?? (await createItemType(prisma)).id;
  const n = next();
  return prisma.unit.create({
    data: {
      itemTypeId,
      assetTag: overrides.assetTag ?? `KH-TST-${String(n).padStart(4, "0")}`,
      status: overrides.status ?? UnitStatus.AVAILABLE,
    },
  });
}
