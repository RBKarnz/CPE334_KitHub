// TEST-22 (AC-22, BR-03) and TEST-47 (AC-47): simultaneous checkouts give exactly one loan
// (contract F-03 3.9, SDS 4.7). Each round starts from an empty database.
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { DAY_MS, checkoutBody, createActiveLoan, createCheckoutWorld, postCheckout } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";

const ROUNDS = 5;
const app = createTestApp();

describe("TEST-22 (AC-22): two checkouts of the same unit", () => {
  it(`TEST-22 (a): two simultaneous checkouts of one unit for two requests create one loan, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetDb(prisma);
      const w = await createCheckoutWorld(prisma);
      const u = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0001" });
      const r1 = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
      const r2 = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.arduino.id });
      const [c1, c2] = [await signIn(app, "custodian1"), await signIn(app, "custodian2")];

      const results = await Promise.all([
        postCheckout(app, c1, r1.id, checkoutBody(r1.lines[0].id, u.id)),
        postCheckout(app, c2, r2.id, checkoutBody(r2.lines[0].id, u.id)),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const winner = results.find((r) => r.status === 201)!;
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe("UNIT_NOT_AVAILABLE");
      // Built from the re-read after the conditional update, not the earlier read (contract F-03 3.7).
      expect(loser.body.error.details[0]).toEqual({ field: "units[0].unitId", issue: "Unit is ON_LOAN" });

      const winnerId = winner.body.id as number;
      const loserId = winnerId === r1.id ? r2.id : r1.id;
      expect(await prisma.loan.count({ where: { unitId: u.id, status: "ACTIVE" } })).toBe(1);
      expect(await prisma.loan.count()).toBe(1);
      expect((await prisma.unit.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("ON_LOAN");
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: winnerId } })).status).toBe("CHECKED_OUT");
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: loserId } })).status).toBe("PENDING");
      const history = await prisma.historyEntry.findMany();
      expect(history).toHaveLength(3);
      expect(history.every((h) => h.requestId === winnerId)).toBe(true);
    }
  }, 60_000);

  it("TEST-22 (b): the database refuses a second ACTIVE loan for a unit (loans_one_active_per_unit)", async () => {
    await resetDb(prisma);
    const w = await createCheckoutWorld(prisma);
    const v = await createUnit(prisma, { itemTypeId: w.arduino.id });
    await createActiveLoan(prisma, { borrowerId: w.b1.id, custodianId: w.c1.id, itemTypeId: w.arduino.id, unitId: v.id });
    const other = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.arduino.id });

    const insert = prisma.loan.create({
      data: {
        requestLineId: other.lines[0].id,
        unitId: v.id,
        status: "ACTIVE",
        checkedOutAt: new Date(),
        checkedOutById: w.c1.id,
        dueAt: new Date(Date.now() + 14 * DAY_MS),
      },
    });

    const err = await insert.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
    expect(await prisma.loan.count({ where: { unitId: v.id, status: "ACTIVE" } })).toBe(1);
  });
});

describe("TEST-47 (AC-47): two checkouts of the same request", () => {
  it(`TEST-47: two simultaneous checkouts of one request with two units create one loan, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetDb(prisma);
      const w = await createCheckoutWorld(prisma);
      const u1 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0001" });
      const u2 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0002" });
      const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
      const lineId = r.lines[0].id;
      const [c1, c2] = [await signIn(app, "custodian1"), await signIn(app, "custodian2")];

      const results = await Promise.all([
        postCheckout(app, c1, r.id, checkoutBody(lineId, u1.id)),
        postCheckout(app, c2, r.id, checkoutBody(lineId, u2.id)),
      ]);

      expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
      const winner = results.find((x) => x.status === 201)!;
      const loser = results.find((x) => x.status === 409)!;
      expect(loser.body.error.code).toBe("INVALID_STATE");
      expect(loser.body.error.message).toBe(
        `Request #${r.id} cannot be checked out because it is CHECKED_OUT, not PENDING.`,
      );

      const wonUnitId = winner.body.lines[0].loans[0].unit.id as number;
      const lostUnitId = wonUnitId === u1.id ? u2.id : u1.id;
      expect(await prisma.loan.count({ where: { requestLineId: lineId } })).toBe(1);
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CHECKED_OUT");
      expect((await prisma.unit.findUniqueOrThrow({ where: { id: wonUnitId } })).status).toBe("ON_LOAN");
      expect((await prisma.unit.findUniqueOrThrow({ where: { id: lostUnitId } })).status).toBe("AVAILABLE");
      expect(await prisma.historyEntry.count()).toBe(3);
    }
  }, 60_000);
});
