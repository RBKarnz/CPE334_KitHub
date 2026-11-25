// TEST-109 (AC-109), API part: both return endpoints are Custodian only (contract F-08 3.3). Every
// call sends Content-Type: application/json and a valid body, so it reaches the session and role
// checks that follow 415.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld, snapshotCheckoutState } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createCheckedOutRequest, postReturnAll, postReturnLoan } from "../helpers/returns.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function setup() {
  const w = await createCheckoutWorld(prisma);
  const { request: r, loans } = await createCheckedOutRequest(prisma, {
    borrowerId: w.b1.id,
    custodianId: w.c1.id,
    lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001", "KH-ARD-0002"] }],
  });
  return { r, loans };
}

describe("TEST-109 (AC-109): Borrowers and calls without a session cannot return", () => {
  it("TEST-109: the owning Borrower gets 403 and no session gets 401 on both endpoints; only the error, nothing changes", async () => {
    const s = await setup();
    const borrower = await signIn(app, "borrower1");
    const before = await snapshotCheckoutState(prisma);
    const all = { loans: s.loans.map((l) => ({ loanId: l.id })) };

    for (const [cookie, status, code] of [
      [borrower, 403, "FORBIDDEN"],
      [undefined, 401, "UNAUTHENTICATED"],
    ] as const) {
      for (const res of [await postReturnAll(app, cookie, s.r.id, all), await postReturnLoan(app, cookie, s.loans[0].id, {})]) {
        expect(res.status).toBe(status);
        expect(res.body.error.code).toBe(code);
        expect(Object.keys(res.body)).toEqual(["error"]);
      }
    }
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });
});
