// F-08 returns (contract F-08 sections 3 and 5): TEST-102 to TEST-107. Every rejection asserts
// that nothing changed (snapshotCheckoutState: loans, history count, request and unit states).
import { RequestStatus, UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld, postCheckout, snapshotCheckoutState } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createItemType, createRequest } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";
import { createCheckedOutRequest, postReturnAll, postReturnLoan } from "../helpers/returns.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

/** TEST-102 data: CHECKED_OUT request R with loans L1 (A1), L2 (A2) on Arduino and L3 (S1) on HC-SR04. */
async function world() {
  const w = await createCheckoutWorld(prisma);
  const sensor = await createItemType(prisma, { name: "HC-SR04 ultrasonic sensor" });
  const { request: r, loans } = await createCheckedOutRequest(prisma, {
    borrowerId: w.b1.id,
    custodianId: w.c1.id,
    lines: [
      { itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001", "KH-ARD-0002"] },
      { itemTypeId: sensor.id, assetTags: ["KH-SR04-0001"] },
    ],
  });
  const [l1, l2, l3] = loans;
  return { ...w, sensor, r, l1, l2, l3, cookie: await signIn(app, "custodian1") };
}

const availableArduinos = (itemTypeId: number) => prisma.unit.count({ where: { itemTypeId, status: UnitStatus.AVAILABLE } });
const loanRow = (id: number) => prisma.loan.findUniqueOrThrow({ where: { id } });
const unitStatus = async (id: number) => (await prisma.unit.findUniqueOrThrow({ where: { id } })).status;
const requestStatus = async (id: number) => (await prisma.borrowRequest.findUniqueOrThrow({ where: { id } })).status;

describe("TEST-102 (AC-102): return all, every loan GOOD", () => {
  it("TEST-102: every loan RETURNED by C, every unit AVAILABLE, the request RETURNED, the count rises", async () => {
    const s = await world();
    const before = await availableArduinos(s.arduino.id);

    const res = await postReturnAll(app, s.cookie, s.r.id, {
      loans: [s.l1, s.l2, s.l3].map((l) => ({ loanId: l.id, condition: "GOOD" })),
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RETURNED");
    const loans = res.body.lines.flatMap((l: { loans: unknown[] }) => l.loans);
    expect(loans).toHaveLength(3);
    for (const loan of loans) {
      expect(loan).toMatchObject({ status: "RETURNED", returnCondition: "GOOD", returnedBy: { id: s.c1.id } });
      expect(loan.returnedAt).toEqual(expect.any(String));
    }
    for (const l of [s.l1, s.l2, s.l3]) {
      const row = await loanRow(l.id);
      expect(row).toMatchObject({ status: "RETURNED", returnedById: s.c1.id, returnCondition: "GOOD" });
      expect(row.returnedAt).not.toBeNull();
      expect(await unitStatus(l.unitId)).toBe("AVAILABLE");
    }
    expect(await requestStatus(s.r.id)).toBe("RETURNED");
    expect(await availableArduinos(s.arduino.id)).toBe(before + 2);
  });
});

describe("TEST-103 (AC-103): a DAMAGED unit goes to MAINTENANCE", () => {
  it("TEST-103: L2 DAMAGED sends A2 to MAINTENANCE; it is not counted and cannot be checked out", async () => {
    const s = await world();
    const before = await availableArduinos(s.arduino.id);

    const res = await postReturnAll(app, s.cookie, s.r.id, {
      loans: [
        { loanId: s.l1.id, condition: "GOOD" },
        { loanId: s.l2.id, condition: "DAMAGED" },
        { loanId: s.l3.id, condition: "GOOD" },
      ],
    });

    expect(res.status).toBe(200);
    expect(await unitStatus(s.l2.unitId)).toBe("MAINTENANCE");
    expect((await loanRow(s.l2.id)).returnCondition).toBe("DAMAGED");
    expect(await availableArduinos(s.arduino.id)).toBe(before + 1);

    const approved = await createRequest(prisma, { borrowerId: s.b2.id, itemTypeId: s.arduino.id, status: RequestStatus.APPROVED });
    const checkout = await postCheckout(app, s.cookie, approved.id, { units: [{ lineId: approved.lines[0].id, unitId: s.l2.unitId }] });
    expect(checkout.status).toBe(409);
    expect(checkout.body.error.code).toBe("UNIT_NOT_AVAILABLE");
  });
});

describe("TEST-104 (AC-104): a condition left out is GOOD", () => {
  it("TEST-104 (a), (b): return all without condition, and an early return with {}", async () => {
    const w = await createCheckoutWorld(prisma);
    const a = await createCheckedOutRequest(prisma, { borrowerId: w.b1.id, custodianId: w.c1.id, lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001"] }] });
    const b = await createCheckedOutRequest(prisma, { borrowerId: w.b2.id, custodianId: w.c1.id, lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0002"] }] });
    const cookie = await signIn(app, "custodian1");

    expect((await postReturnAll(app, cookie, a.request.id, { loans: [{ loanId: a.loans[0].id }] })).status).toBe(200);
    expect((await postReturnLoan(app, cookie, b.loans[0].id, {})).status).toBe(200);

    for (const l of [a.loans[0], b.loans[0]]) {
      expect((await loanRow(l.id)).returnCondition).toBe("GOOD");
      expect(await unitStatus(l.unitId)).toBe("AVAILABLE");
    }
  });
});

describe("TEST-105 (AC-105): early return of one unit", () => {
  it("TEST-105 (a), (b): the request stays CHECKED_OUT until the last loan is back", async () => {
    const w = await createCheckoutWorld(prisma);
    const { request: r, loans } = await createCheckedOutRequest(prisma, {
      borrowerId: w.b1.id,
      custodianId: w.c1.id,
      lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001", "KH-ARD-0002"] }],
    });
    const [l1, l2] = loans;
    const cookie = await signIn(app, "custodian1");

    const first = await postReturnLoan(app, cookie, l1.id, { condition: "GOOD" });
    expect(first.status).toBe(200);
    expect(first.body.id).toBe(r.id);
    expect(first.body.status).toBe("CHECKED_OUT");
    expect((await loanRow(l1.id)).status).toBe("RETURNED");
    expect(await unitStatus(l1.unitId)).toBe("AVAILABLE");
    expect((await loanRow(l2.id)).status).toBe("ACTIVE");
    expect(await requestStatus(r.id)).toBe("CHECKED_OUT");

    const last = await postReturnLoan(app, cookie, l2.id, { condition: "DAMAGED" });
    expect(last.status).toBe(200);
    expect(last.body.status).toBe("RETURNED");
    expect((await loanRow(l2.id)).status).toBe("RETURNED");
    expect(await unitStatus(l2.unitId)).toBe("MAINTENANCE");
    expect(await requestStatus(r.id)).toBe("RETURNED");
  });
});

describe("TEST-106 (AC-106): return-all bodies that do not name exactly the active loans", () => {
  it("TEST-106 (a) to (e): each 400 naming the problem, and nothing changes", async () => {
    const w = await createCheckoutWorld(prisma);
    const { request: r, loans } = await createCheckedOutRequest(prisma, {
      borrowerId: w.b1.id,
      custodianId: w.c1.id,
      lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001", "KH-ARD-0002"] }],
    });
    const other = await createCheckedOutRequest(prisma, {
      borrowerId: w.b2.id,
      custodianId: w.c1.id,
      lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0009"] }],
    });
    const [l1, l2] = loans;
    const l9 = other.loans[0];
    const cookie = await signIn(app, "custodian1");
    const cases: [string, unknown, string, string | null][] = [
      ["(a) only L1", { loans: [{ loanId: l1.id }] }, "loans", "1 active loan is missing"],
      ["(b) L1 twice", { loans: [{ loanId: l1.id }, { loanId: l1.id }, { loanId: l2.id }] }, "loans[1].loanId", `Loan ${l1.id} is listed twice`],
      ["(c) a loan of another request", { loans: [{ loanId: l1.id }, { loanId: l2.id }, { loanId: l9.id }] }, "loans[2].loanId", `Loan ${l9.id} is not a loan of request #${r.id}`],
      ["(d) condition LOST", { loans: [{ loanId: l1.id }, { loanId: l2.id, condition: "LOST" }] }, "loans[1].condition", null],
      ["(e) an extra field", { loans: [{ loanId: l1.id }, { loanId: l2.id }], returnedById: 1 }, "returnedById", null],
    ];
    for (const [name, body, field, issue] of cases) {
      const before = await snapshotCheckoutState(prisma);
      const res = await postReturnAll(app, cookie, r.id, body);
      expect(res.status, name).toBe(400);
      expect(res.body.error.code, name).toBe("VALIDATION_FAILED");
      expect(detailFields(res), name).toContain(field);
      if (issue) expect(res.body.error.details, name).toContainEqual({ field, issue });
      expect(await snapshotCheckoutState(prisma), name).toEqual(before);
    }
  });
});

describe("TEST-107 (AC-107): states that cannot be returned; unknown request or loan", () => {
  it("TEST-107 (a): APPROVED and RETURNED requests, a RETURNED loan, and 999999", async () => {
    const w = await createCheckoutWorld(prisma);
    const approved = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id, status: RequestStatus.APPROVED });
    const done = await createCheckedOutRequest(prisma, { borrowerId: w.b2.id, custodianId: w.c1.id, lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001"] }] });
    const cookie = await signIn(app, "custodian1");
    expect((await postReturnAll(app, cookie, done.request.id, { loans: [{ loanId: done.loans[0].id }] })).status).toBe(200);

    const before = await snapshotCheckoutState(prisma);
    // Each call runs only when awaited, one after another.
    const checks: [() => ReturnType<typeof postReturnAll>, number, string][] = [
      [() => postReturnAll(app, cookie, approved.id, { loans: [{ loanId: 1 }] }), 409, `Request #${approved.id} cannot be returned because it is APPROVED, not CHECKED_OUT.`],
      [() => postReturnAll(app, cookie, done.request.id, { loans: [{ loanId: done.loans[0].id }] }), 409, `Request #${done.request.id} cannot be returned because it is RETURNED, not CHECKED_OUT.`],
      [() => postReturnLoan(app, cookie, done.loans[0].id, {}), 409, `Loan ${done.loans[0].id} cannot be returned because it is RETURNED, not ACTIVE.`],
      [() => postReturnAll(app, cookie, 999999, { loans: [{ loanId: 1 }] }), 404, "Request 999999 does not exist."],
      [() => postReturnLoan(app, cookie, 999999, {}), 404, "Loan 999999 does not exist."],
    ];
    for (const [call, status, message] of checks) {
      const res = await call();
      expect(res.status, message).toBe(status);
      expect(res.body.error.code, message).toBe(status === 409 ? "INVALID_STATE" : "NOT_FOUND");
      expect(res.body.error.message).toBe(message);
    }
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });

  it("TEST-107 (b): a return-all naming a loan already returned early is 409 for that loan; L2 stays ACTIVE", async () => {
    const w = await createCheckoutWorld(prisma);
    const { request: r, loans } = await createCheckedOutRequest(prisma, {
      borrowerId: w.b1.id,
      custodianId: w.c1.id,
      lines: [{ itemTypeId: w.arduino.id, assetTags: ["KH-ARD-0001", "KH-ARD-0002"] }],
    });
    const [l1, l2] = loans;
    const cookie = await signIn(app, "custodian1");
    expect((await postReturnLoan(app, cookie, l1.id, {})).status).toBe(200);
    const before = await snapshotCheckoutState(prisma);

    const res = await postReturnAll(app, cookie, r.id, { loans: [{ loanId: l1.id }, { loanId: l2.id }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(res.body.error.message).toBe(`Loan ${l1.id} cannot be returned because it is RETURNED, not ACTIVE.`);
    expect((await loanRow(l2.id)).status).toBe("ACTIVE");
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });
});
