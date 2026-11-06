import bcrypt from "bcryptjs";
import { UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { seed } from "../../prisma/seed-lib.js";
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
