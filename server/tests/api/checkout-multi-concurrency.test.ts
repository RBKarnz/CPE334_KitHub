// TEST-96 (AC-96): two simultaneous checkouts that share two units, named in opposite body order,
// give exactly one success and never deadlock (contract F-07 3.7). Each round starts empty.
import { RequestStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld, postCheckout } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";

const ROUNDS = 5;
const app = createTestApp();

describe("TEST-96 (AC-96): two checkouts that share units", () => {
  it(`TEST-96: one 201 and one 409 UNIT_NOT_AVAILABLE; the loser stays APPROVED with no loan; ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await resetDb(prisma);
      const w = await createCheckoutWorld(prisma);
      const u1 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0001" });
      const u2 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0002" });
      const approved = { itemTypeId: w.arduino.id, quantity: 2, status: RequestStatus.APPROVED, loanDays: 7 };
      const r1 = await createRequest(prisma, { borrowerId: w.b1.id, ...approved });
      const r2 = await createRequest(prisma, { borrowerId: w.b2.id, ...approved });
      const [c1, c2] = [await signIn(app, "custodian1"), await signIn(app, "custodian2")];
      const l1 = r1.lines[0].id;
      const l2 = r2.lines[0].id;

      const results = await Promise.all([
        postCheckout(app, c1, r1.id, { units: [{ lineId: l1, unitId: u1.id }, { lineId: l1, unitId: u2.id }] }),
        postCheckout(app, c2, r2.id, { units: [{ lineId: l2, unitId: u2.id }, { lineId: l2, unitId: u1.id }] }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe("UNIT_NOT_AVAILABLE");
      const winnerId = results.find((r) => r.status === 201)!.body.id as number;
      const loserId = winnerId === r1.id ? r2.id : r1.id;
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: loserId } })).status).toBe("APPROVED");
      expect(await prisma.loan.count({ where: { requestLine: { requestId: loserId } } })).toBe(0);
      for (const u of [u1, u2]) {
        expect((await prisma.unit.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("ON_LOAN");
        expect(await prisma.loan.count({ where: { unitId: u.id, status: "ACTIVE" } })).toBe(1);
      }
    }
  }, 60_000);
});
