// Seed data and the insert-if-missing logic (SDS 4.8). Run through prisma/seed.ts.
// - Fixed synthetic data only; nothing is random.
// - Inserts a record only if none exists with the same natural key (username, category
//   name, item type name, asset tag). Never changes an existing record.
// - Passwords come only from environment variables and are never printed.
import { ActorType, HistoryEntity, LoanStatus, PrismaClient, RequestStatus, ReturnCondition, Role, UnitStatus } from "@prisma/client";
import { computeDueAt } from "../src/domain/due-date.js";
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
export async function seed(prisma: PrismaClient, config: Omit<SeedConfig, "seedDemoRequests">): Promise<SeedResult> {
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

// ---------------------------------------------------------------------------------------
// Sprint 2 demo requests (#73), seeded only with SEED_DEMO_REQUESTS=true and only into a
// database that has no request yet, so a database in use (for example production) is never
// changed. One request per Sprint 2 state, with the history entries the features write, so
// every Sprint 2 screen has something to show. Times are hours before the seed time, so the
// demo states do not age (the approval stays inside the 48-hour window of BR-13, and the
// checked-out loan is not overdue, BR-15).

const HOUR_MS = 3_600_000;

interface DemoLine {
  itemType: string;
  quantity: number;
  /** Asset tags checked out for this line (CHECKED_OUT and RETURNED requests only) */
  units?: string[];
}

/** Every time is a number of hours before the seed time. */
interface DemoRequest {
  borrower: string;
  status: RequestStatus;
  loanDays: number;
  createdAt: number;
  lines: DemoLine[];
  /** Approval or rejection by custodian1 */
  decidedAt?: number;
  rejectionReason?: string;
  cancelledAt?: number;
  checkedOutAt?: number;
  returnedAt?: number;
}

const DEMO_REQUESTS: DemoRequest[] = [
  {
    borrower: "borrower1",
    status: RequestStatus.PENDING,
    loanDays: 7,
    createdAt: 1,
    lines: [
      { itemType: "Arduino Uno R3", quantity: 2 },
      { itemType: "HC-SR04 ultrasonic sensor", quantity: 1 },
    ],
  },
  {
    borrower: "borrower2",
    status: RequestStatus.APPROVED,
    loanDays: 14,
    createdAt: 5,
    decidedAt: 2,
    lines: [{ itemType: "ESP32 DevKitC", quantity: 1 }],
  },
  {
    borrower: "borrower2",
    status: RequestStatus.REJECTED,
    loanDays: 14,
    createdAt: 6,
    decidedAt: 3,
    rejectionReason: "All Raspberry Pi units are booked for the IoT workshop this week.",
    lines: [{ itemType: "Raspberry Pi 4 Model B", quantity: 1 }],
  },
  {
    borrower: "borrower1",
    status: RequestStatus.CANCELLED,
    loanDays: 3,
    createdAt: 8,
    cancelledAt: 4,
    lines: [{ itemType: "Digital multimeter", quantity: 1 }],
  },
  {
    borrower: "borrower1",
    status: RequestStatus.CHECKED_OUT,
    loanDays: 14,
    createdAt: 27,
    decidedAt: 26,
    checkedOutAt: 24,
    lines: [{ itemType: "DHT22 temperature and humidity sensor", quantity: 2, units: ["KH-DHT-0001", "KH-DHT-0002"] }],
  },
  {
    borrower: "borrower2",
    status: RequestStatus.RETURNED,
    loanDays: 7,
    createdAt: 8 * 24,
    decidedAt: 8 * 24 - 2,
    checkedOutAt: 7 * 24,
    returnedAt: 24,
    lines: [{ itemType: "Transistor kit (2N2222 ×4)", quantity: 1, units: ["KH-TRK-0001"] }],
  },
];

/** Inserts the Sprint 2 demo requests into a database with no request. Returns how many were created. */
export async function seedDemoRequests(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const at = (hoursBefore: number) => new Date(now.getTime() - hoursBefore * HOUR_MS);
  return prisma.$transaction(
    async (tx) => {
      if ((await tx.borrowRequest.count()) > 0) return 0;

      const users = await tx.user.findMany({
        where: { username: { in: ["borrower1", "borrower2", "custodian1"] } },
        select: { id: true, username: true },
      });
      const userId = (username: string) => {
        const u = users.find((x) => x.username === username);
        if (!u) throw new Error(`Demo requests need the seeded account ${username}`);
        return u.id;
      };
      const custodian = userId("custodian1");

      for (const demo of DEMO_REQUESTS) {
        const borrower = userId(demo.borrower);
        const request = await tx.borrowRequest.create({
          data: {
            borrowerId: borrower,
            status: demo.status,
            loanDays: demo.loanDays,
            createdAt: at(demo.createdAt),
            decidedById: demo.decidedAt ? custodian : null,
            decidedAt: demo.decidedAt ? at(demo.decidedAt) : null,
            rejectionReason: demo.rejectionReason ?? null,
          },
        });
        const requestEntry = (occurredAt: number, actorUserId: number, fromStatus: string | null, toStatus: string, action = "STATUS_CHANGED") =>
          tx.historyEntry.create({
            data: {
              occurredAt: at(occurredAt),
              actorType: ActorType.USER,
              actorUserId,
              entityType: HistoryEntity.REQUEST,
              requestId: request.id,
              action,
              fromStatus,
              toStatus,
            },
          });
        await requestEntry(demo.createdAt, borrower, null, RequestStatus.PENDING, "CREATED");
        if (demo.decidedAt) {
          const decided = demo.status === RequestStatus.REJECTED ? RequestStatus.REJECTED : RequestStatus.APPROVED;
          await requestEntry(demo.decidedAt, custodian, RequestStatus.PENDING, decided);
        }
        if (demo.cancelledAt) await requestEntry(demo.cancelledAt, borrower, RequestStatus.PENDING, RequestStatus.CANCELLED);

        for (const line of demo.lines) {
          const itemType = await tx.itemType.findUniqueOrThrow({ where: { name: line.itemType }, select: { id: true } });
          const created = await tx.requestLine.create({
            data: { requestId: request.id, itemTypeId: itemType.id, quantity: line.quantity, createdAt: at(demo.createdAt) },
          });
          if (!demo.checkedOutAt) continue;

          const checkedOutAt = at(demo.checkedOutAt);
          const returnedAt = demo.returnedAt;
          for (const tag of line.units ?? []) {
            // Never overwrite a unit that is on loan, in maintenance or retired (review of PR #80).
            const unit = await tx.unit.findUniqueOrThrow({ where: { assetTag: tag }, select: { id: true, status: true } });
            if (unit.status !== UnitStatus.AVAILABLE)
              throw new Error(`Demo requests need ${tag} to be AVAILABLE, but ${tag} is ${unit.status}, not AVAILABLE`);
            const loan = await tx.loan.create({
              data: {
                requestLineId: created.id,
                unitId: unit.id,
                status: returnedAt ? LoanStatus.RETURNED : LoanStatus.ACTIVE,
                checkedOutAt,
                checkedOutById: custodian,
                dueAt: computeDueAt(checkedOutAt, demo.loanDays),
                returnedAt: returnedAt ? at(returnedAt) : null,
                returnedById: returnedAt ? custodian : null,
                returnCondition: returnedAt ? ReturnCondition.GOOD : null,
              },
            });
            await tx.unit.update({ where: { id: unit.id }, data: { status: returnedAt ? UnitStatus.AVAILABLE : UnitStatus.ON_LOAN } });
            const entry = (occurredAt: number, entityType: HistoryEntity, fromStatus: string | null, toStatus: string, action = "STATUS_CHANGED") =>
              tx.historyEntry.create({
                data: {
                  occurredAt: at(occurredAt),
                  actorType: ActorType.USER,
                  actorUserId: custodian,
                  entityType,
                  requestId: request.id,
                  unitId: unit.id,
                  loanId: entityType === HistoryEntity.LOAN ? loan.id : null,
                  action,
                  fromStatus,
                  toStatus,
                },
              });
            await entry(demo.checkedOutAt, HistoryEntity.UNIT, UnitStatus.AVAILABLE, UnitStatus.ON_LOAN);
            await entry(demo.checkedOutAt, HistoryEntity.LOAN, null, LoanStatus.ACTIVE, "CREATED");
            if (returnedAt) {
              await entry(returnedAt, HistoryEntity.UNIT, UnitStatus.ON_LOAN, UnitStatus.AVAILABLE);
              await entry(returnedAt, HistoryEntity.LOAN, LoanStatus.ACTIVE, LoanStatus.RETURNED);
            }
          }
        }
        if (demo.checkedOutAt) await requestEntry(demo.checkedOutAt, custodian, RequestStatus.APPROVED, RequestStatus.CHECKED_OUT);
        if (demo.returnedAt) await requestEntry(demo.returnedAt, custodian, RequestStatus.CHECKED_OUT, RequestStatus.RETURNED);
      }
      return DEMO_REQUESTS.length;
    },
    { timeout: 30_000 },
  );
}
