// TEST-108 (AC-108): concurrent returns of the same loans (contract F-08 3.7). Each loan is returned
// once, exactly one call ends the request, and history is written only for what changed.
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createCheckedOutRequest, postReturnAll, postReturnLoan } from "../helpers/returns.js";

const ROUNDS = 5;
const app = createTestApp();

async function setup() {
  await resetDb(prisma);
  const w = await createCheckoutWorld(prisma);
  const { request: r, loans } = await createCheckedOutRequest(prisma, {
    borrowerId: w.b1.id,
    custodianId: w.c1.id,
    lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001", "KH-ARD-0002"] }],
  });
  const [l1, l2] = loans;
  return { r, l1, l2, c1: await signIn(app, "custodian1"), c2: await signIn(app, "custodian2") };
}

const requestEnds = (requestId: number) =>
  prisma.historyEntry.count({ where: { requestId, entityType: "REQUEST", fromStatus: "CHECKED_OUT", toStatus: "RETURNED" } });
const loanReturns = (loanId: number) =>
  prisma.historyEntry.count({ where: { loanId, entityType: "LOAN", toStatus: "RETURNED" } });

describe("TEST-108 (AC-108): concurrent returns", () => {
  it(`TEST-108 (a): two return-all calls give one 200 and one 409; each loan returned once, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const body = { loans: [{ loanId: s.l1.id }, { loanId: s.l2.id }] };

      const results = await Promise.all([postReturnAll(app, s.c1, s.r.id, body), postReturnAll(app, s.c2, s.r.id, body)]);

      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      expect(results.find((x) => x.status === 409)!.body.error.code).toBe("INVALID_STATE");
      expect(await loanReturns(s.l1.id)).toBe(1);
      expect(await loanReturns(s.l2.id)).toBe(1);
      expect(await requestEnds(s.r.id)).toBe(1);
    }
  }, 60_000);

  it(`TEST-108 (b): early returns of L1 and L2 at once both succeed; exactly one ends the request, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();

      const results = await Promise.all([postReturnLoan(app, s.c1, s.l1.id, {}), postReturnLoan(app, s.c2, s.l2.id, {})]);

      expect(results.map((x) => x.status)).toEqual([200, 200]);
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: s.r.id } })).status).toBe("RETURNED");
      expect(await requestEnds(s.r.id)).toBe(1);
    }
  }, 60_000);

  it(`TEST-108 (c): a return-all and an early return of L1 at once: one 200, one 409 (never 400), ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();

      const [all, early] = await Promise.all([
        postReturnAll(app, s.c1, s.r.id, { loans: [{ loanId: s.l1.id }, { loanId: s.l2.id }] }),
        postReturnLoan(app, s.c2, s.l1.id, {}),
      ]);

      expect([all.status, early.status].sort()).toEqual([200, 409]);
      const loser = all.status === 409 ? all : early;
      expect(loser.body.error.code).toBe("INVALID_STATE");
      const request = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: s.r.id } });
      const l2 = await prisma.loan.findUniqueOrThrow({ where: { id: s.l2.id } });
      if (early.status === 200) {
        expect(request.status).toBe("CHECKED_OUT");
        expect(l2.status).toBe("ACTIVE");
      } else {
        expect(request.status).toBe("RETURNED");
      }
      expect(await loanReturns(s.l1.id)).toBe(1);
    }
  }, 60_000);
});
