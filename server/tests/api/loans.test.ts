// TEST-98 (AC-98) and TEST-99 (AC-99): GET /api/loans, scoped by role (contract F-07 5.2, F07-D5).
import request from "supertest";
import { LoanStatus, RequestStatus, UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

// F-08 5.3 adds returnCondition to every loan, and returnedBy to the Custodian view.
const LOAN_KEYS = ["checkedOutAt", "dueAt", "id", "itemType", "request", "returnCondition", "returnedAt", "status", "unit"];

/** Borrower B: 2 active loans (due 3 Dec and 7 Dec) and 1 returned; Borrower B2: 1 active loan. */
async function world() {
  const w = await createCheckoutWorld(prisma);
  let n = 0;
  const loan = async (borrowerId: number, dueAt: string, returned = false) => {
    n += 1;
    const unit = await createUnit(prisma, {
      itemTypeId: w.arduino.id,
      assetTag: `KH-ARD-000${n}`,
      status: returned ? UnitStatus.AVAILABLE : UnitStatus.ON_LOAN,
    });
    const r = await createRequest(prisma, {
      borrowerId,
      itemTypeId: w.arduino.id,
      status: returned ? RequestStatus.RETURNED : RequestStatus.CHECKED_OUT,
    });
    return prisma.loan.create({
      data: {
        requestLineId: r.lines[0].id,
        unitId: unit.id,
        status: returned ? LoanStatus.RETURNED : LoanStatus.ACTIVE,
        checkedOutAt: new Date("2026-11-26T03:00:00.000Z"),
        checkedOutById: w.c1.id,
        dueAt: new Date(dueAt),
        ...(returned ? { returnedAt: new Date("2026-11-28T03:00:00.000Z"), returnedById: w.c1.id } : {}),
      },
    });
  };
  const late = await loan(w.b1.id, "2026-12-07T10:00:00.000Z");
  const early = await loan(w.b1.id, "2026-12-03T10:00:00.000Z");
  const returned = await loan(w.b1.id, "2026-12-01T10:00:00.000Z", true);
  const other = await loan(w.b2.id, "2026-12-04T10:00:00.000Z");
  return { ...w, late, early, returned, other };
}

describe("TEST-98 (AC-98): a Borrower's loans", () => {
  it("TEST-98: only the Borrower's active loans, earliest due first, with the F07-D5 fields and no borrower", async () => {
    const s = await world();

    const res = await request(app).get("/api/loans").set("Cookie", await signIn(app, "borrower1"));

    expect(res.status).toBe(200);
    expect(res.body.items.map((l: { id: number }) => l.id)).toEqual([s.early.id, s.late.id]);
    for (const item of res.body.items) expect(Object.keys(item).sort()).toEqual(LOAN_KEYS);
    expect(res.body.items[0]).toMatchObject({
      status: "ACTIVE",
      dueAt: "2026-12-03T10:00:00.000Z",
      returnedAt: null,
      unit: { assetTag: "KH-ARD-0002" },
      itemType: { id: s.arduino.id, name: "Arduino Uno R3" },
      request: { id: expect.any(Number) },
    });
  });
});

describe("TEST-99 (AC-99): a Custodian's loans", () => {
  it("TEST-99 (a), (b): every Borrower's active loans with the borrower; status=RETURNED lists the returned loan", async () => {
    const s = await world();
    const cookie = await signIn(app, "custodian1");

    const active = await request(app).get("/api/loans").set("Cookie", cookie);
    expect(active.status).toBe(200);
    expect(active.body.items.map((l: { id: number }) => l.id)).toEqual([s.early.id, s.other.id, s.late.id]);
    for (const item of active.body.items) expect(Object.keys(item).sort()).toEqual([...LOAN_KEYS, "borrower", "returnedBy"].sort());
    expect(active.body.items[1].borrower).toEqual({ id: s.b2.id, username: "borrower2", displayName: "Borrower Two" });

    const returned = await request(app).get("/api/loans?status=RETURNED").set("Cookie", cookie);
    expect(returned.status).toBe(200);
    expect(returned.body.items.map((l: { id: number }) => l.id)).toEqual([s.returned.id]);
    expect(returned.body.items[0].returnedAt).toBe("2026-11-28T03:00:00.000Z");
  });

  it.each([
    ["status=LOST", "status"],
    ["x=1", "x"],
  ])("TEST-99 (c), (d): ?%s is 400 naming %s", async (query, field) => {
    await world();

    const res = await request(app).get(`/api/loans?${query}`).set("Cookie", await signIn(app, "custodian1"));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === field || f.endsWith(`.${field}`))).toBe(true);
  });
});
