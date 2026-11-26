// TEST-119 (AC-119): races on catalog management (contract F-09 3.7). Fresh data per round; each
// race ends with exactly one success, a rule-specific 409 (never the generic CONFLICT), and
// history only for the winner.
import { RequestStatus, UnitStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { postCategory, postUnit, retireUnit } from "../helpers/catalog.js";
import { checkoutBody, postCheckout } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemType, createRequest, createUnit } from "../helpers/factories.js";

const ROUNDS = 5;
const app = createTestApp();

async function setup() {
  await resetDb(prisma);
  await createCustodian(prisma, { username: "custodian1" });
  await createCustodian(prisma, { username: "custodian2" });
  const borrower = await createBorrower(prisma, { username: "borrower1" });
  return { borrower, c1: await signIn(app, "custodian1"), c2: await signIn(app, "custodian2") };
}

const statusesOf = (results: { status: number }[]) => results.map((r) => r.status).sort();

describe("TEST-119 (AC-119): concurrent catalog management", () => {
  it(`TEST-119 (a): a retire and a checkout of the same AVAILABLE unit: exactly one wins, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const t = await createItemType(prisma, { name: "Arduino Uno R3" });
      const u = await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-ARD-0001" });
      const r = await createRequest(prisma, { borrowerId: s.borrower.id, itemTypeId: t.id, status: RequestStatus.APPROVED, loanDays: 7 });

      const [retire, checkout] = await Promise.all([
        retireUnit(app, s.c1, u.id),
        postCheckout(app, s.c2, r.id, checkoutBody(r.lines[0].id, u.id)),
      ]);

      const unit = await prisma.unit.findUniqueOrThrow({ where: { id: u.id } });
      const unitEntries = await prisma.historyEntry.findMany({ where: { unitId: u.id, entityType: "UNIT" } });
      if (retire.status === 200) {
        expect(checkout.status).toBe(409);
        expect(checkout.body.error.code).toBe("UNIT_NOT_AVAILABLE");
        expect(unit.status).toBe(UnitStatus.RETIRED);
        expect(await prisma.loan.count()).toBe(0);
        expect(unitEntries.map((e) => e.toStatus)).toEqual(["RETIRED"]);
      } else {
        expect(retire.status).toBe(409);
        expect(retire.body.error.code).toBe("INVALID_STATE");
        expect(checkout.status).toBe(201);
        expect(unit.status).toBe(UnitStatus.ON_LOAN);
        expect(unitEntries.map((e) => e.toStatus)).toEqual(["ON_LOAN"]);
      }
    }
  }, 60_000);

  it(`TEST-119 (b): two adds of KH-SRV-0009 to two item types: one 201, one 409 ASSET_TAG_TAKEN, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const t1 = await createItemType(prisma);
      const t2 = await createItemType(prisma);

      const results = await Promise.all([
        postUnit(app, s.c1, t1.id, { assetTag: "KH-SRV-0009" }),
        postUnit(app, s.c2, t2.id, { assetTag: "KH-SRV-0009" }),
      ]);

      expect(statusesOf(results)).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe("ASSET_TAG_TAKEN");
      expect(await prisma.unit.count({ where: { assetTag: "KH-SRV-0009" } })).toBe(1);
      expect(await prisma.historyEntry.count()).toBe(1);
    }
  }, 60_000);

  it.each([
    ["(c) two creates named Robotics", "Robotics", "Robotics"],
    ["(d) Robotics and robotics", "Robotics", "robotics"],
  ])(`TEST-119 %s: one 201, one 409 NAME_TAKEN, ${ROUNDS} rounds`, async (_label, first, second) => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const body = (name: string) => ({ name, defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });

      const results = await Promise.all([postCategory(app, s.c1, body(first)), postCategory(app, s.c2, body(second))]);

      expect(statusesOf(results)).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe("NAME_TAKEN");
      expect(await prisma.category.count()).toBe(1);
    }
  }, 60_000);
});
