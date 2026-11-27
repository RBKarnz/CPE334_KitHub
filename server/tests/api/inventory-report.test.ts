// TEST-158 to TEST-162 (AC-158 to AC-162): GET /api/reports/inventory (contract F-14 3.3, 5.1;
// F14-D1 to F14-D5). Loans in TEST-159 and TEST-161 go through the real approve and checkout.
import { UnitStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { repairUnit, retireUnit } from "../helpers/catalog.js";
import { createCheckoutWorld, postCheckout, snapshotCheckoutState } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { addLine, createCategory, createItemType, createRequest, createUnit } from "../helpers/factories.js";
import { detailFields, getAs, postDecision } from "../helpers/requests.js";
import { postReturnLoan } from "../helpers/returns.js";

const app = createTestApp();
const PATH = "/api/reports/inventory";

beforeEach(async () => {
  await resetDb(prisma);
});
afterEach(() => vi.useRealTimers());

const setClock = (iso: string) => vi.setSystemTime(new Date(iso));
const COUNTS = ["available", "onLoan", "maintenance", "retired", "totalUnits", "activeLoans", "overdueRequests"] as const;
type Row = { itemType: { id: number; name: string }; category: { id: number; name: string } } & Record<(typeof COUNTS)[number], number>;
const rowOf = (body: { items: Row[] }, itemTypeId: number) => body.items.find((r) => r.itemType.id === itemTypeId)!;
const figures = (r: Row, keys: readonly (typeof COUNTS)[number][]) => keys.map((k) => r[k]);

/** TEST-158 data (contract 8.2): A in all four states, B one AVAILABLE unit, C no unit. */
async function stockWorld() {
  const w = await createCheckoutWorld(prisma);
  const boards = await createCategory(prisma, { name: "Boards" });
  const sensors = await createCategory(prisma, { name: "Sensors" });
  const a = await createItemType(prisma, { categoryId: boards.id, name: "Arduino Nano" });
  const b = await createItemType(prisma, { categoryId: sensors.id, name: "HC-SR04 ultrasonic sensor" });
  const c = await createItemType(prisma, { categoryId: sensors.id, name: "Starter kit", isKit: true });
  for (const status of [UnitStatus.AVAILABLE, UnitStatus.AVAILABLE, UnitStatus.MAINTENANCE, UnitStatus.RETIRED])
    await createUnit(prisma, { itemTypeId: a.id, status });
  // The ON_LOAN unit has its ACTIVE loan (BR-03), written as test data.
  const onLoan = await createUnit(prisma, { itemTypeId: a.id });
  const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: a.id, status: "CHECKED_OUT", loanDays: 3 });
  await prisma.unit.update({ where: { id: onLoan.id }, data: { status: UnitStatus.ON_LOAN } });
  await prisma.loan.create({
    data: {
      requestLineId: r.lines[0].id,
      unitId: onLoan.id,
      status: "ACTIVE",
      checkedOutAt: new Date("2026-11-30T03:00:00.000Z"),
      checkedOutById: w.c1.id,
      dueAt: new Date("2026-12-03T10:00:00.000Z"),
    },
  });
  await createUnit(prisma, { itemTypeId: b.id });
  return { ...w, a, b, c, boards, sensors };
}

/** Approve a PENDING request and check out every line with the given units at `at` (F-06, F-07). */
async function approveAndCheckOut(custodian: () => Promise<string>, requestId: number, at: string, units: { lineId: number; unitId: number }[]) {
  setClock(at);
  const cookie = await custodian();
  expect((await postDecision(app, cookie, requestId, "approve", {})).status).toBe(200);
  const res = await postCheckout(app, cookie, requestId, { units });
  expect(res.status).toBe(201);
}

describe("TEST-158 (AC-158): unit counts per item type", () => {
  it("TEST-158: A 2/1/1/1 total 5, B 1/0/0/0, C all zero, in category and name order", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-01T03:00:00.000Z") });
    const s = await stockWorld();
    const res = await getAs(app, await signIn(app, "custodian1"), PATH);

    expect(res.status).toBe(200);
    const ours = res.body.items.filter((r: Row) => [s.a.id, s.b.id, s.c.id].includes(r.itemType.id));
    expect(ours.map((r: Row) => r.itemType.id)).toEqual([s.a.id, s.b.id, s.c.id]);
    expect(rowOf(res.body, s.a.id)).toEqual({
      itemType: { id: s.a.id, name: "Arduino Nano" },
      category: { id: s.boards.id, name: "Boards" },
      available: 2, onLoan: 1, maintenance: 1, retired: 1, totalUnits: 5, activeLoans: 1, overdueRequests: 0,
    });
    expect(figures(rowOf(res.body, s.b.id), ["available", "onLoan", "maintenance", "retired", "totalUnits"])).toEqual([1, 0, 0, 0, 1]);
    expect(figures(rowOf(res.body, s.c.id), COUNTS)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("TEST-159 and TEST-160 (AC-159, AC-160): active loans, overdue requests and totals", () => {
  async function loanWorld() {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-30T02:00:00.000Z") });
    const w = await createCheckoutWorld(prisma);
    const a = await createItemType(prisma, { name: "Arduino Nano", maxLoanDays: 14 });
    const b = await createItemType(prisma, { name: "HC-SR04 ultrasonic sensor", maxLoanDays: 14 });
    const a1 = await createUnit(prisma, { itemTypeId: a.id });
    const a2 = await createUnit(prisma, { itemTypeId: a.id });
    const b1 = await createUnit(prisma, { itemTypeId: b.id });
    const r1 = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: a.id, loanDays: 3 });
    const r1b = await addLine(prisma, r1.id, b.id, 1);
    const r2 = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: a.id, loanDays: 10 });
    const custodian = () => signIn(app, "custodian1");
    // R1 at Mon 30 Nov 10:00 ICT, due Thu 3 Dec 17:00 ICT; R2 at 11:00 ICT, due Thu 10 Dec 17:00 ICT.
    await approveAndCheckOut(custodian, r1.id, "2026-11-30T03:00:00.000Z", [
      { lineId: r1.lines[0].id, unitId: a1.id },
      { lineId: r1b.id, unitId: b1.id },
    ]);
    await approveAndCheckOut(custodian, r2.id, "2026-11-30T04:00:00.000Z", [{ lineId: r2.lines[0].id, unitId: a2.id }]);
    expect((await prisma.loan.findFirstOrThrow({ where: { unitId: a1.id } })).dueAt.toISOString()).toBe("2026-12-03T10:00:00.000Z");
    return { a, b, custodian };
  }

  it("TEST-159: not overdue at dueAt exactly; 1 ms later R1 counts once for A and once for B", async () => {
    const s = await loanWorld();

    setClock("2026-12-03T10:00:00.000Z");
    const first = await getAs(app, await s.custodian(), PATH);
    expect(first.status).toBe(200);
    for (const [id, loans] of [[s.a.id, 2], [s.b.id, 1]] as const) {
      expect(figures(rowOf(first.body, id), ["activeLoans", "onLoan", "overdueRequests"])).toEqual([loans, loans, 0]);
    }

    setClock("2026-12-03T10:00:00.001Z");
    const second = await getAs(app, await s.custodian(), PATH);
    for (const [id, loans] of [[s.a.id, 2], [s.b.id, 1]] as const) {
      expect(figures(rowOf(second.body, id), ["activeLoans", "onLoan", "overdueRequests"])).toEqual([loans, loans, 1]);
    }
  });

  it("TEST-160: totals sum each column; overdueRequests counts R1 once; generatedAt is the clock", async () => {
    await loanWorld();
    setClock("2026-12-03T10:00:00.001Z");
    const res = await getAs(app, await signIn(app, "custodian1"), PATH);

    expect(res.status).toBe(200);
    for (const key of COUNTS.filter((k) => k !== "overdueRequests")) {
      expect(res.body.totals[key], key).toBe(res.body.items.reduce((sum: number, r: Row) => sum + r[key], 0));
    }
    expect(res.body.items.reduce((sum: number, r: Row) => sum + r.overdueRequests, 0)).toBe(2);
    expect(res.body.totals.overdueRequests).toBe(1);
    expect(res.body.totals.itemType).toBeUndefined();
    expect(res.body.generatedAt).toBe("2026-12-03T10:00:00.001Z");
  });
});

describe("TEST-161 (AC-161): the report follows checkout, damaged return, repair and retire", () => {
  it("TEST-161: row A in each of the five reports", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-30T02:00:00.000Z") });
    const w = await createCheckoutWorld(prisma);
    const a = await createItemType(prisma, { name: "Arduino Nano", maxLoanDays: 14 });
    const u1 = await createUnit(prisma, { itemTypeId: a.id });
    await createUnit(prisma, { itemTypeId: a.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: a.id, loanDays: 3 });
    const custodian = () => signIn(app, "custodian1");
    const report = async () => {
      const res = await getAs(app, await custodian(), PATH);
      expect(res.status).toBe(200);
      const row = rowOf(res.body, a.id);
      expect(row.totalUnits).toBe(2);
      expect(row.overdueRequests).toBe(0);
      return figures(row, ["available", "onLoan", "maintenance", "retired", "activeLoans"]);
    };

    expect(await report()).toEqual([2, 0, 0, 0, 0]);
    await approveAndCheckOut(custodian, r.id, "2026-11-30T03:00:00.000Z", [{ lineId: r.lines[0].id, unitId: u1.id }]);
    expect(await report()).toEqual([1, 1, 0, 0, 1]);

    const loan = await prisma.loan.findFirstOrThrow({ where: { unitId: u1.id } });
    expect((await postReturnLoan(app, await custodian(), loan.id, { condition: "DAMAGED" })).status).toBe(200);
    expect(await report()).toEqual([1, 0, 1, 0, 0]);

    expect((await repairUnit(app, await custodian(), u1.id)).status).toBe(200);
    expect(await report()).toEqual([2, 0, 0, 0, 0]);

    expect((await retireUnit(app, await custodian(), u1.id)).status).toBe(200);
    expect(await report()).toEqual([1, 0, 0, 1, 0]);
  });
});

describe("TEST-162 (AC-162): access and validation", () => {
  it("TEST-162 (a) to (c): Borrower 403, no session 401, a query field 400; nothing written", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-01T03:00:00.000Z") });
    await stockWorld();
    const before = await snapshotCheckoutState(prisma);

    const borrower = await getAs(app, await signIn(app, "borrower1"), PATH);
    expect(borrower.status).toBe(403);
    expect(borrower.body.error.code).toBe("FORBIDDEN");

    const none = await getAs(app, undefined, PATH);
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHENTICATED");

    const query = await getAs(app, await signIn(app, "custodian1"), `${PATH}?itemTypeId=1`);
    expect(query.status).toBe(400);
    expect(query.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(query).some((f) => f === "itemTypeId" || f.endsWith(".itemTypeId"))).toBe(true);

    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });
});
