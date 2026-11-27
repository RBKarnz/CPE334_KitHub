// TEST-134 to TEST-138 (AC-134 to AC-138): BR-15 (overdue block) and BR-14 (5-unit limit) on
// request create and edit, and their place in the check order (contract F-11 3.1, 3.4, 3.5;
// F11-D3 to F11-D5).
import { RequestStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createItemType, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { createLoanedRequest, fixClock, markReturned } from "../helpers/overdue.js";
import { postReturnLoan } from "../helpers/returns.js";
import { linesBody, patchRequest, postRequest, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();
const NOW = "2026-12-04T03:00:00.000Z"; // Fri 4 Dec 2026, 10:00 ICT
const PAST = "2026-12-03T10:00:00.000Z"; // Thu 3 Dec 17:00 ICT: overdue at NOW
const LATER = "2026-12-05T10:00:00.000Z"; // not yet due at NOW

beforeEach(async () => {
  await resetDb(prisma);
});
afterEach(() => vi.useRealTimers());

/** People and item types with enough AVAILABLE units for every case; limits allow up to 5 per line. */
async function world() {
  const w = await createCheckoutWorld(prisma);
  const sensor = await createItemTypeWithUnits(prisma, { name: "HC-SR04 ultrasonic sensor", maxQuantityPerRequest: 5 }, { AVAILABLE: 6 });
  const cable = await createItemTypeWithUnits(prisma, { name: "USB-A to USB-B cable", maxQuantityPerRequest: 5 }, { AVAILABLE: 6 });
  const board = await createItemTypeWithUnits(prisma, { name: "Raspberry Pi 4 Model B", maxQuantityPerRequest: 5 }, { AVAILABLE: 6 });
  const kit = await createItemTypeWithUnits(prisma, { name: "Transistor kit (2N2222 ×4)", isKit: true, maxQuantityPerRequest: 1 }, { AVAILABLE: 2 });
  const loaned = await createItemType(prisma, { name: "Loaned item", maxQuantityPerRequest: 5 });
  return { ...w, sensor, cable, board, kit, loaned };
}

const holdLoans = (w: Awaited<ReturnType<typeof world>>, borrowerId: number, count: number, dueAt = LATER) =>
  createLoanedRequest(prisma, { borrowerId, custodianId: w.c1.id, dueAt, lines: [{ itemTypeId: w.loaned.id, count }] });

const overdueMessage = (id: number) => `You cannot make a new request while Request #${id} is overdue. Return every unit of it first.`;

describe("TEST-134 (AC-134): an overdue Borrower cannot create a request (BR-15)", () => {
  it("TEST-134 (a) to (c): blocked until every unit of the overdue request is returned", async () => {
    const w = await world();
    const r1 = await holdLoans(w, w.b1.id, 2, PAST);
    fixClock(NOW);
    const b1 = await signIn(app, "borrower1");
    const custodian = await signIn(app, "custodian1");

    const before = await snapshotRequestState(prisma);
    const blocked = await postRequest(app, b1, linesBody(3, [w.sensor.id, 1]));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("OVERDUE_BLOCK");
    expect(blocked.body.error.message).toBe(overdueMessage(r1.request.id));
    expect(blocked.body.error.details).toEqual([{ field: "body", issue: `Request #${r1.request.id} is overdue` }]);
    expect(await snapshotRequestState(prisma)).toEqual(before);

    expect((await postReturnLoan(app, custodian, r1.loans[0].id, { condition: "GOOD" })).status).toBe(200);
    const still = await postRequest(app, b1, linesBody(3, [w.sensor.id, 1]));
    expect(still.status).toBe(409);
    expect(still.body.error.code).toBe("OVERDUE_BLOCK");

    expect((await postReturnLoan(app, custodian, r1.loans[1].id, { condition: "GOOD" })).status).toBe(200);
    expect((await postRequest(app, b1, linesBody(3, [w.sensor.id, 1]))).status).toBe(201);
  });

  it("TEST-134 (d), (e): a loan due later, or due exactly now, does not block", async () => {
    const w = await world();
    await holdLoans(w, w.b2.id, 1, LATER);
    fixClock(NOW);
    const b2 = await signIn(app, "borrower2");
    expect((await postRequest(app, b2, linesBody(3, [w.sensor.id, 1]))).status).toBe(201);

    vi.setSystemTime(new Date(LATER)); // at dueAt exactly (F11-D2)
    // 31 hours later the 8-hour session has expired, so sign in again.
    const b2Later = await signIn(app, "borrower2");
    expect((await postRequest(app, b2Later, linesBody(3, [w.cable.id, 1]))).status).toBe(201);
  });
});

describe("TEST-135 (AC-135): the overdue block also applies to an edit", () => {
  it("TEST-135: editing an own PENDING request is refused; nothing changes", async () => {
    const w = await world();
    const r1 = await holdLoans(w, w.b1.id, 1, PAST);
    const p = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.sensor.id, quantity: 1, loanDays: 3 });
    fixClock(NOW);
    const before = await snapshotRequestState(prisma);

    const res = await patchRequest(app, await signIn(app, "borrower1"), p.id, linesBody(3, [w.sensor.id, 2]));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OVERDUE_BLOCK");
    expect(res.body.error.message).toBe(overdueMessage(r1.request.id));
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });
});

describe("TEST-136 (AC-136): the 5-unit limit on create (BR-14, D-20)", () => {
  it("TEST-136 (e): holding 0, a request of 5 units in 2 lines is allowed", async () => {
    const w = await world();
    fixClock(NOW);
    expect((await postRequest(app, await signIn(app, "borrower1"), linesBody(3, [w.sensor.id, 3], [w.cable.id, 2]))).status).toBe(201);
  });

  it("TEST-136 (f), (g): holding 3 (2 ACTIVE loans + a PENDING line of 1), 2 more is allowed and 3 more is not", async () => {
    const w = await world();
    await holdLoans(w, w.b1.id, 2);
    await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.board.id, quantity: 1, loanDays: 3 });
    fixClock(NOW);
    const b1 = await signIn(app, "borrower1");

    const before = await snapshotRequestState(prisma);
    const over = await postRequest(app, b1, linesBody(3, [w.sensor.id, 3]));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("BORROW_LIMIT");
    expect(over.body.error.message).toBe("You can hold at most 5 units. You hold 3 and asked for 3.");
    expect(over.body.error.details).toEqual([{ field: "lines", issue: "3 held + 3 asked > 5" }]);
    expect(await snapshotRequestState(prisma)).toEqual(before);

    expect((await postRequest(app, b1, linesBody(3, [w.sensor.id, 2]))).status).toBe(201);
  });

  it("TEST-136 (h): CANCELLED and REJECTED requests and RETURNED loans do not count", async () => {
    const w = await world();
    const loans = await holdLoans(w, w.b1.id, 3);
    await markReturned(prisma, loans.loans[0].id, w.c1.id); // 2 ACTIVE loans remain
    await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.board.id, quantity: 2, loanDays: 3 }); // PENDING 2
    await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.cable.id, quantity: 3, loanDays: 3, status: RequestStatus.CANCELLED });
    await createRequest(prisma, {
      borrowerId: w.b1.id,
      itemTypeId: w.cable.id,
      quantity: 2,
      loanDays: 3,
      status: RequestStatus.REJECTED,
      decidedById: w.c1.id,
      decidedAt: new Date("2026-12-01T03:00:00.000Z"),
      rejectionReason: "Test data",
    });
    fixClock(NOW);
    expect((await postRequest(app, await signIn(app, "borrower1"), linesBody(3, [w.sensor.id, 1]))).status).toBe(201);
  });

  it("TEST-136 (i): a kit counts as one unit", async () => {
    const w = await world();
    await holdLoans(w, w.b1.id, 4);
    fixClock(NOW);
    expect((await postRequest(app, await signIn(app, "borrower1"), linesBody(3, [w.kit.id, 1]))).status).toBe(201);
  });

  it("TEST-136 (j): an APPROVED request counts by its line quantities", async () => {
    const w = await world();
    await createRequest(prisma, {
      borrowerId: w.b1.id,
      itemTypeId: w.board.id,
      quantity: 2,
      loanDays: 3,
      status: RequestStatus.APPROVED,
      decidedById: w.c1.id,
      decidedAt: new Date("2026-12-04T01:00:00.000Z"),
    });
    await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.cable.id, quantity: 2, loanDays: 3 });
    fixClock(NOW);
    const res = await postRequest(app, await signIn(app, "borrower1"), linesBody(3, [w.sensor.id, 2]));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("BORROW_LIMIT");
    expect(res.body.error.message).toBe("You can hold at most 5 units. You hold 4 and asked for 2.");
  });

  it("TEST-136 (k): after an early return only the remaining ACTIVE loans count, not the line quantity", async () => {
    const w = await world();
    const r = await holdLoans(w, w.b1.id, 3);
    await markReturned(prisma, r.loans[0].id, w.c1.id);
    fixClock(NOW);
    expect((await postRequest(app, await signIn(app, "borrower1"), linesBody(3, [w.sensor.id, 3]))).status).toBe(201);
  });
});

describe("TEST-137 (AC-137): the limit on edit leaves out the edited request", () => {
  it("TEST-137 (a), (b): 3 + 3 is refused, 3 + 2 is allowed", async () => {
    const w = await world();
    await holdLoans(w, w.b1.id, 2);
    await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.board.id, quantity: 1, loanDays: 3 });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.cable.id, quantity: 2, loanDays: 3 });
    fixClock(NOW);
    const b1 = await signIn(app, "borrower1");

    const before = await snapshotRequestState(prisma);
    const over = await patchRequest(app, b1, r.id, linesBody(3, [w.cable.id, 3]));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("BORROW_LIMIT");
    expect(over.body.error.message).toBe("You can hold at most 5 units. You hold 3 and asked for 3.");
    expect(await snapshotRequestState(prisma)).toEqual(before);

    expect((await patchRequest(app, b1, r.id, linesBody(3, [w.sensor.id, 2]))).status).toBe(200);
  });
});

describe("TEST-138 (AC-138): check order 404 → BR-15 → BR-04 → … → BR-14 → BR-01", () => {
  it("TEST-138 (a) to (d)", async () => {
    const w = await world();
    const b3 = await createBorrower(prisma, { username: "borrower3", displayName: "Borrower Three" });
    // B1: overdue and holding 5.
    await holdLoans(w, w.b1.id, 5, PAST);
    // B2: holding 5 with an open request for the sensor.
    await holdLoans(w, w.b2.id, 4);
    await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.sensor.id, quantity: 1, loanDays: 3 });
    // B3: holding 4; an item type with only 1 available unit.
    await holdLoans(w, b3.id, 4);
    const scarce = await createItemTypeWithUnits(prisma, { name: "Scarce sensor", maxQuantityPerRequest: 5 }, { AVAILABLE: 1 });
    fixClock(NOW);

    const b1 = await signIn(app, "borrower1");
    expect((await postRequest(app, b1, linesBody(3, [999999, 1]))).status).toBe(404);
    const overdue = await postRequest(app, b1, linesBody(3, [w.sensor.id, 1]));
    expect(overdue.body.error?.code).toBe("OVERDUE_BLOCK");

    const duplicate = await postRequest(app, await signIn(app, "borrower2"), linesBody(3, [w.sensor.id, 1]));
    expect(duplicate.body.error?.code).toBe("DUPLICATE_OPEN_REQUEST");

    const limit = await postRequest(app, await signIn(app, "borrower3"), linesBody(3, [scarce.id, 2]));
    expect(limit.body.error?.code).toBe("BORROW_LIMIT");
  });
});

