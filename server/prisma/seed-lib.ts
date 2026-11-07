// Seed data and the insert-if-missing logic (SDS 4.8). Run through prisma/seed.ts.
// - Fixed synthetic data only; nothing is random.
// - Inserts a record only if none exists with the same natural key (username, category
//   name, item type name, asset tag). Never changes an existing record.
// - Passwords come only from environment variables and are never printed.
import { PrismaClient, Role, UnitStatus } from "@prisma/client";
import type { SeedConfig } from "../src/core/config.js";
import { hashPassword } from "../src/features/auth/password.js";

interface SeedItemType {
  name: string;
  description: string;
  isKit?: boolean;
  /** Asset tag prefix and count: KH-<code>-0001 to KH-<code>-<count> */
  code: string;
  count: number;
  /** Units seeded in a state other than AVAILABLE */
  statusOverrides?: Record<string, UnitStatus>;
}

interface SeedCategory {
  name: string;
  defaultMaxLoanDays: number;
  defaultMaxQuantity: number;
  itemTypes: SeedItemType[];
}

// Limits from SRS D-08; several units per item type (D-17).
export const SEED_CATALOG: SeedCategory[] = [
  {
    name: "Microcontroller boards",
    defaultMaxLoanDays: 14,
    defaultMaxQuantity: 2,
    itemTypes: [
      { name: "Arduino Uno R3", description: "ATmega328P development board with USB-B port.", code: "ARD", count: 5 },
      { name: "ESP32 DevKitC", description: "ESP32 development board with Wi-Fi and Bluetooth.", code: "ESP", count: 4 },
    ],
  },
  {
    name: "Single-board computers",
    defaultMaxLoanDays: 14,
    defaultMaxQuantity: 1,
    itemTypes: [
      { name: "Raspberry Pi 4 Model B", description: "Single-board computer with 4 GB RAM.", code: "RPI", count: 3 },
    ],
  },
  {
    name: "Sensors and modules",
    defaultMaxLoanDays: 14,
    defaultMaxQuantity: 4,
    itemTypes: [
      { name: "HC-SR04 ultrasonic sensor", description: "Ultrasonic distance sensor, 2 cm to 4 m.", code: "SR04", count: 6 },
      {
        name: "DHT22 temperature and humidity sensor",
        description: "Digital temperature and relative humidity sensor.",
        code: "DHT",
        count: 6,
      },
    ],
  },
  {
    name: "Component kits",
    defaultMaxLoanDays: 14,
    defaultMaxQuantity: 3,
    itemTypes: [
      {
        name: "Transistor kit (2N2222 ×4)",
        description: "Kit of four 2N2222 NPN transistors, lent and returned as one unit.",
        isKit: true,
        code: "TRK",
        count: 4,
      },
    ],
  },
  {
    name: "Cables and accessories",
    defaultMaxLoanDays: 14,
    defaultMaxQuantity: 4,
    itemTypes: [{ name: "USB-A to USB-B cable", description: "USB 2.0 cable, 1 m.", code: "USB", count: 6 }],
  },
  {
    name: "Instruments",
    defaultMaxLoanDays: 3,
    defaultMaxQuantity: 1,
    itemTypes: [
      { name: "Digital multimeter", description: "Handheld digital multimeter.", code: "DMM", count: 3 },
      {
        name: "Oscilloscope",
        description: "Two-channel digital storage oscilloscope.",
        code: "OSC",
        count: 1,
        // In maintenance, so 0 units are available: the fixed BR-01 rejection case.
        statusOverrides: { "KH-OSC-0001": UnitStatus.MAINTENANCE },
      },
    ],
  },
];

interface SeedAccount {
  username: string;
  displayName: string;
  role: Role;
  demoOnly: boolean;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  { username: "custodian1", displayName: "Custodian One", role: Role.CUSTODIAN, demoOnly: false },
  { username: "custodian2", displayName: "Custodian Two", role: Role.CUSTODIAN, demoOnly: false },
  { username: "borrower1", displayName: "Borrower One", role: Role.BORROWER, demoOnly: true },
  { username: "borrower2", displayName: "Borrower Two", role: Role.BORROWER, demoOnly: true },
];

export const assetTag = (code: string, n: number) => `KH-${code}-${String(n).padStart(4, "0")}`;

export interface SeedResult {
  categories: number;
  itemTypes: number;
  units: number;
  users: number;
}

/** Inserts missing seed records. Returns how many records of each kind were created. */
export async function seed(prisma: PrismaClient, config: SeedConfig): Promise<SeedResult> {
  const created: SeedResult = { categories: 0, itemTypes: 0, units: 0, users: 0 };

  const accounts = SEED_ACCOUNTS.filter((a) => !a.demoOnly || config.seedDemoData);
  const existingUsers = await prisma.user.findMany({
    where: { username: { in: accounts.map((a) => a.username) } },
    select: { username: true },
  });
  const existing = new Set(existingUsers.map((u) => u.username));
  // Hash outside the transaction; only for accounts that do not exist yet.
  const newAccounts = await Promise.all(
    accounts
      .filter((a) => !existing.has(a.username))
      .map(async (a) => ({
        ...a,
        passwordHash: await hashPassword(
          a.role === Role.CUSTODIAN ? config.custodianPassword : (config.borrowerPassword as string),
          config.bcryptCost,
        ),
      })),
  );

  await prisma.$transaction(
    async (tx) => {
      for (const category of SEED_CATALOG) {
        let cat = await tx.category.findUnique({ where: { name: category.name } });
        if (!cat) {
          cat = await tx.category.create({
            data: {
              name: category.name,
              defaultMaxLoanDays: category.defaultMaxLoanDays,
              defaultMaxQuantity: category.defaultMaxQuantity,
            },
          });
          created.categories++;
        }

        for (const itemType of category.itemTypes) {
          let type = await tx.itemType.findUnique({ where: { name: itemType.name } });
          if (!type) {
            // A new item type copies its category's limits (SDS 4.2).
            type = await tx.itemType.create({
              data: {
                categoryId: cat.id,
                name: itemType.name,
                description: itemType.description,
                maxLoanDays: cat.defaultMaxLoanDays,
                maxQuantityPerRequest: cat.defaultMaxQuantity,
                isKit: itemType.isKit ?? false,
              },
            });
            created.itemTypes++;
          }

          for (let n = 1; n <= itemType.count; n++) {
            const tag = assetTag(itemType.code, n);
            const unit = await tx.unit.findUnique({ where: { assetTag: tag }, select: { id: true } });
            if (!unit) {
              await tx.unit.create({
                data: {
                  itemTypeId: type.id,
                  assetTag: tag,
                  status: itemType.statusOverrides?.[tag] ?? UnitStatus.AVAILABLE,
                },
              });
              created.units++;
            }
          }
        }
      }

      for (const account of newAccounts) {
        await tx.user.create({
          data: {
            username: account.username,
            displayName: account.displayName,
            role: account.role,
            passwordHash: account.passwordHash,
          },
        });
        created.users++;
      }
    },
    { timeout: 30_000 },
  );

  return created;
}
