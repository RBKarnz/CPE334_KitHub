import bcrypt from "bcryptjs";
import { UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { seed, seedDemoRequests } from "../../prisma/seed-lib.js";
import { prisma } from "../helpers/app.js";
import { resetDb } from "../helpers/db.js";

// Test-only values; the real seed reads them from SEED_* variables.
const config = {
  bcryptCost: 4,
  seedDemoData: true,
  custodianPassword: "test-only-custodian",
  borrowerPassword: "test-only-borrower",
};

async function snapshot() {
  return {
    categories: await prisma.category.findMany({ orderBy: { id: "asc" } }),
    itemTypes: await prisma.itemType.findMany({ orderBy: { id: "asc" } }),
    units: await prisma.unit.findMany({ orderBy: { id: "asc" } }),
    users: await prisma.user.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("seed (SDS 4.8)", () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it("inserts the planned catalog with D-08 limits and the oscilloscope in MAINTENANCE", async () => {
    const created = await seed(prisma, config);
    expect(created).toEqual({ categories: 6, itemTypes: 9, units: 38, users: 4 });

    const instruments = await prisma.category.findUniqueOrThrow({
      where: { name: "Instruments" },
      include: { itemTypes: true },
    });
    expect(instruments).toMatchObject({ defaultMaxLoanDays: 3, defaultMaxQuantity: 1 });
    for (const type of instruments.itemTypes) expect(type).toMatchObject({ maxLoanDays: 3, maxQuantityPerRequest: 1 });

    const arduino = await prisma.itemType.findUniqueOrThrow({ where: { name: "Arduino Uno R3" }, include: { units: true } });
    expect(arduino).toMatchObject({ maxLoanDays: 14, maxQuantityPerRequest: 2 });
    expect(arduino.units.map((u) => u.assetTag).sort()).toEqual([
      "KH-ARD-0001",
      "KH-ARD-0002",
      "KH-ARD-0003",
      "KH-ARD-0004",
      "KH-ARD-0005",
    ]);

    const osc = await prisma.unit.findUniqueOrThrow({ where: { assetTag: "KH-OSC-0001" } });
    expect(osc.status).toBe(UnitStatus.MAINTENANCE);
    expect(await prisma.unit.count({ where: { status: { not: UnitStatus.AVAILABLE } } })).toBe(1);

    const kit = await prisma.itemType.findUniqueOrThrow({ where: { name: "Transistor kit (2N2222 ×4)" } });
    expect(kit.isKit).toBe(true);
  });

  it("hashes passwords with bcrypt and seeds the right roles", async () => {
    await seed(prisma, config);
    const users = await prisma.user.findMany({ orderBy: { username: "asc" } });

    expect(users.map((u) => [u.username, u.role])).toEqual([
      ["borrower1", "BORROWER"],
      ["borrower2", "BORROWER"],
      ["custodian1", "CUSTODIAN"],
      ["custodian2", "CUSTODIAN"],
    ]);
    const custodian = users.find((u) => u.username === "custodian1")!;
    expect(custodian.passwordHash).toMatch(/^\$2[aby]\$04\$/);
    expect(custodian.passwordHash).not.toContain(config.custodianPassword);
    expect(await bcrypt.compare(config.custodianPassword, custodian.passwordHash)).toBe(true);
    // Same password, different salts.
    expect(users[2].passwordHash).not.toBe(users[3].passwordHash);
  });

  it("seeds Borrower accounts only when SEED_DEMO_DATA is true", async () => {
    await seed(prisma, { ...config, seedDemoData: false, borrowerPassword: undefined });

    expect((await prisma.user.findMany()).map((u) => u.username).sort()).toEqual(["custodian1", "custodian2"]);
  });

  it("seeds one demo request in every Sprint 2 state, with consistent loans, units and history (#73)", async () => {
    await seed(prisma, config);

    expect(await seedDemoRequests(prisma)).toBe(6);

    const requests = await prisma.borrowRequest.findMany({ include: { lines: { include: { loans: true } } }, orderBy: { id: "asc" } });
    expect(requests.map((r) => r.status).sort()).toEqual(["APPROVED", "CANCELLED", "CHECKED_OUT", "PENDING", "REJECTED", "RETURNED"]);
    for (const r of requests) expect(r.loanDays).toBeGreaterThanOrEqual(1);

    const rejected = requests.find((r) => r.status === "REJECTED")!;
    expect(rejected.rejectionReason?.trim()).not.toBe("");
    for (const r of requests.filter((x) => x.status === "APPROVED" || x.status === "REJECTED")) {
      expect(r.decidedById).not.toBeNull();
      expect(r.decidedAt).not.toBeNull();
    }

    // Loans: ACTIVE for CHECKED_OUT, RETURNED (with returnedAt) for RETURNED; units match.
    const checkedOut = requests.find((r) => r.status === "CHECKED_OUT")!;
    const activeLoans = checkedOut.lines.flatMap((l) => l.loans);
    expect(activeLoans.length).toBeGreaterThanOrEqual(2);
    for (const loan of activeLoans) {
      expect(loan.status).toBe("ACTIVE");
      expect((await prisma.unit.findUniqueOrThrow({ where: { id: loan.unitId } })).status).toBe(UnitStatus.ON_LOAN);
    }
    const returned = requests.find((r) => r.status === "RETURNED")!;
    for (const loan of returned.lines.flatMap((l) => l.loans)) {
      expect(loan.status).toBe("RETURNED");
      expect(loan.returnedAt).not.toBeNull();
      expect((await prisma.unit.findUniqueOrThrow({ where: { id: loan.unitId } })).status).toBe(UnitStatus.AVAILABLE);
    }
    expect(await prisma.unit.count({ where: { status: UnitStatus.ON_LOAN } })).toBe(activeLoans.length);

    // BR-16: every seeded request has history; the newest entry ends in its current state.
    for (const r of requests) {
      const last = await prisma.historyEntry.findFirst({ where: { requestId: r.id, entityType: "REQUEST" }, orderBy: { id: "desc" } });
      expect(last?.toStatus).toBe(r.status);
    }
  });

  it("adds no demo request when any request already exists, so a used database is never changed (#73)", async () => {
    await seed(prisma, config);
    expect(await seedDemoRequests(prisma)).toBe(6);
    const before = await prisma.borrowRequest.count();

    expect(await seedDemoRequests(prisma)).toBe(0);
    expect(await prisma.borrowRequest.count()).toBe(before);
  });

  it("changes nothing when run a second time, even after records were changed", async () => {
    await seed(prisma, config);
    // A unit state and a password changed after the first run must be kept.
    await prisma.unit.update({ where: { assetTag: "KH-ARD-0001" }, data: { status: UnitStatus.ON_LOAN } });
    const before = await snapshot();

    const second = await seed(prisma, { ...config, custodianPassword: "test-only-other" });

    expect(second).toEqual({ categories: 0, itemTypes: 0, units: 0, users: 0 });
    expect(await snapshot()).toEqual(before);
  });
});
