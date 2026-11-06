// POST /api/requests/:id/checkout (contract F-03 3 and 5.3): TEST-19, TEST-20, TEST-21, TEST-26
// and TEST-42 to TEST-46. Every rejection asserts that nothing changed (contract F-03 3.6).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import {
  DAY_MS,
  checkoutBody,
  createActiveLoan,
  createCheckoutWorld,
  getUnits,
  postCheckout,
  snapshotCheckoutState,
} from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

const statusOf = {
  request: async (id: number) => (await prisma.borrowRequest.findUniqueOrThrow({ where: { id } })).status,
  unit: async (id: number) => (await prisma.unit.findUniqueOrThrow({ where: { id } })).status,
};

describe("TEST-19 (AC-19): normal checkout", () => {
  it("TEST-19: checking out an AVAILABLE unit creates one ACTIVE loan due 14 days later and moves request and unit", async () => {
    const w = await createCheckoutWorld(prisma);
    const u = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0007" });
    const other = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0008" });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const lineId = r.lines[0].id;
    const cookie = await signIn(app, "custodian1");

    const t0 = Date.now();
    const res = await postCheckout(app, cookie, r.id, checkoutBody(lineId, u.id));
    const t1 = Date.now();

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(r.id);
    expect(res.body.status).toBe("CHECKED_OUT");
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].id).toBe(lineId);
    expect(res.body.lines[0].loans).toHaveLength(1);
    const loan = res.body.lines[0].loans[0];
    expect(loan).toMatchObject({
      status: "ACTIVE",
      unit: { id: u.id, assetTag: "KH-ARD-0007" },
      checkedOutBy: { id: w.c1.id, username: "custodian1", displayName: "Custodian One" },
    });
    const checkedOutAt = new Date(loan.checkedOutAt).getTime();
    expect(checkedOutAt).toBeGreaterThanOrEqual(t0);
    expect(checkedOutAt).toBeLessThanOrEqual(t1);
    expect(new Date(loan.dueAt).getTime() - checkedOutAt).toBe(14 * DAY_MS);
    expect(res.body.dueAt).toBe(loan.dueAt);

    // Database
    expect(await statusOf.request(r.id)).toBe("CHECKED_OUT");
    expect(await statusOf.unit(u.id)).toBe("ON_LOAN");
    expect(await statusOf.unit(other.id)).toBe("AVAILABLE");
    const rows = await prisma.loan.findMany({ where: { requestLineId: lineId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ACTIVE", unitId: u.id, checkedOutById: w.c1.id });
    expect(rows[0].id).toBe(loan.id);
    expect(rows[0].dueAt.toISOString()).toBe(loan.dueAt);
    expect(rows[0].checkedOutAt.toISOString()).toBe(loan.checkedOutAt);
    expect(await prisma.loan.count()).toBe(1);
  });

  it("TEST-19: an item type with maxLoanDays 3 gives a loan due 3 days later (D-16)", async () => {
    const w = await createCheckoutWorld(prisma);
    const u = await createUnit(prisma, { itemTypeId: w.multimeter.id, assetTag: "KH-DMM-0001" });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.multimeter.id });

    const res = await postCheckout(app, await signIn(app, "custodian1"), r.id, checkoutBody(r.lines[0].id, u.id));

    expect(res.status).toBe(201);
    const loan = res.body.lines[0].loans[0];
    expect(new Date(loan.dueAt).getTime() - new Date(loan.checkedOutAt).getTime()).toBe(3 * DAY_MS);
  });
});

describe("TEST-20 (AC-20): unit not AVAILABLE, and no AVAILABLE unit at all (D-17)", () => {
  async function setup() {
    const w = await createCheckoutWorld(prisma);
    const u1 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0001" });
    const u2 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0002", status: "MAINTENANCE" });
    // U1 is ON_LOAN with an ACTIVE loan for another request.
    const { loan } = await createActiveLoan(prisma, {
      borrowerId: w.b2.id,
      custodianId: w.c2.id,
      itemTypeId: w.arduino.id,
      unitId: u1.id,
    });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const cookie = await signIn(app, "custodian1");
    return { w, u1, u2, loan, r, lineId: r.lines[0].id, cookie };
  }

  async function expectNothingChanged(s: Awaited<ReturnType<typeof setup>>, before: unknown) {
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(s.r.id)).toBe("PENDING");
    expect(await statusOf.unit(s.u1.id)).toBe("ON_LOAN");
    expect(await statusOf.unit(s.u2.id)).toBe("MAINTENANCE");
    const u1Loans = await prisma.loan.findMany({ where: { unitId: s.u1.id } });
    expect(u1Loans.map((l) => l.id)).toEqual([s.loan.id]);
  }

  it("TEST-20 (a): a unit that is ON_LOAN is 409 UNIT_NOT_AVAILABLE and nothing changes", async () => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, s.r.id, checkoutBody(s.lineId, s.u1.id));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("UNIT_NOT_AVAILABLE");
    expect(res.body.error.message).toBe("Unit KH-ARD-0001 is not available for checkout.");
    expect(res.body.error.details[0]).toEqual({ field: "units[0].unitId", issue: "Unit is ON_LOAN" });
    await expectNothingChanged(s, before);
  });

  it("TEST-20 (b): a unit in MAINTENANCE is 409 UNIT_NOT_AVAILABLE and nothing changes", async () => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, s.r.id, checkoutBody(s.lineId, s.u2.id));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("UNIT_NOT_AVAILABLE");
    expect(res.body.error.details[0]).toEqual({ field: "units[0].unitId", issue: "Unit is MAINTENANCE" });
    await expectNothingChanged(s, before);
  });

  it("TEST-20 (c): with no AVAILABLE unit the unit list is empty and checkout with any unit is rejected; the request stays PENDING", async () => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const list = await getUnits(app, s.cookie, s.w.arduino.id, "status=AVAILABLE");
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ items: [] });

    for (const unit of [s.u1, s.u2]) {
      const res = await postCheckout(app, s.cookie, s.r.id, checkoutBody(s.lineId, unit.id));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("UNIT_NOT_AVAILABLE");
      await expectNothingChanged(s, before);
    }
  });
});

describe("TEST-21 (AC-21): unit of a different item type", () => {
  it.each([
    ["(a)", "AVAILABLE"],
    ["(b)", "ON_LOAN"],
  ] as const)("TEST-21 %s: an ESP32 unit that is %s is 409 UNIT_WRONG_ITEM_TYPE and nothing changes", async (_c, unitStatus) => {
    const w = await createCheckoutWorld(prisma);
    const e1 = await createUnit(prisma, { itemTypeId: w.esp32.id, assetTag: "KH-ESP-0001" });
    const e2 = await createUnit(prisma, { itemTypeId: w.esp32.id, assetTag: "KH-ESP-0002" });
    await createActiveLoan(prisma, { borrowerId: w.b2.id, custodianId: w.c2.id, itemTypeId: w.esp32.id, unitId: e2.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const unit = unitStatus === "AVAILABLE" ? e1 : e2;
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, cookie, r.id, checkoutBody(r.lines[0].id, unit.id));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("UNIT_WRONG_ITEM_TYPE");
    expect(res.body.error.message).toBe(`Unit ${unit.assetTag} is not a unit of Arduino Uno R3.`);
    expect(res.body.error.details[0]).toEqual({
      field: "units[0].unitId",
      issue: "Unit belongs to item type ESP32 DevKitC",
    });
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(r.id)).toBe("PENDING");
    expect(await statusOf.unit(e1.id)).toBe("AVAILABLE");
    expect(await statusOf.unit(e2.id)).toBe("ON_LOAN");
    expect(await prisma.loan.count({ where: { requestLine: { requestId: r.id } } })).toBe(0);
  });
});

describe("TEST-26 (AC-26): the Borrower sees the checked-out request; the available count drops", () => {
  it("TEST-26: Borrower sees CHECKED_OUT with asset tag and due date and no checkedOutBy; count 3 → 2; another Borrower gets 404", async () => {
    const w = await createCheckoutWorld(prisma);
    const units = [];
    for (const n of [1, 2, 3])
      units.push(await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: `KH-ARD-000${n}` }));
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const b1Cookie = await signIn(app, "borrower1");

    const availableCount = async () => {
      const res = await request(app).get("/api/categories").set("Cookie", b1Cookie);
      expect(res.status).toBe(200);
      const itemTypes = res.body.items.flatMap((c: { itemTypes: { id: number }[] }) => c.itemTypes);
      return itemTypes.find((t: { id: number }) => t.id === w.arduino.id).availableCount as number;
    };
    expect(await availableCount()).toBe(3);

    const checkout = await postCheckout(
      app,
      await signIn(app, "custodian1"),
      r.id,
      checkoutBody(r.lines[0].id, units[0].id),
    );
    expect(checkout.status).toBe(201);

    const own = await request(app).get(`/api/requests/${r.id}`).set("Cookie", b1Cookie);
    expect(own.status).toBe(200);
    expect(own.body.status).toBe("CHECKED_OUT");
    expect(own.body.dueAt).toEqual(expect.any(String));
    const loan = own.body.lines[0].loans[0];
    expect(loan.unit.assetTag).toBe("KH-ARD-0001");
    expect(loan.checkedOutAt).toEqual(expect.any(String));
    expect(loan.dueAt).toBe(own.body.dueAt);
    expect(loan).not.toHaveProperty("checkedOutBy");
    expect(Object.keys(loan).sort()).toEqual(["checkedOutAt", "dueAt", "id", "status", "unit"]);

    expect(await availableCount()).toBe(2);

    const otherBorrower = await request(app)
      .get(`/api/requests/${r.id}`)
      .set("Cookie", await signIn(app, "borrower2"));
    expect(otherBorrower.status).toBe(404);
    expect(otherBorrower.body.error.code).toBe("NOT_FOUND");
    expect(Object.keys(otherBorrower.body)).toEqual(["error"]);
  });
});

describe("TEST-42 (AC-42): request does not exist", () => {
  it("TEST-42 (a): request 999999 is 404 NOT_FOUND and nothing changes", async () => {
    const w = await createCheckoutWorld(prisma);
    const u = await createUnit(prisma, { itemTypeId: w.arduino.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, cookie, 999999, checkoutBody(r.lines[0].id, u.id));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Request #999999 does not exist.");
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(r.id)).toBe("PENDING");
    expect(await statusOf.unit(u.id)).toBe("AVAILABLE");
  });

  it("TEST-42 (b): request 999999 with unit 999999 is 404 for the request, without unit details", async () => {
    const w = await createCheckoutWorld(prisma);
    const u = await createUnit(prisma, { itemTypeId: w.arduino.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, cookie, 999999, checkoutBody(r.lines[0].id, 999999));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Request #999999 does not exist.");
    expect(detailFields(res)).not.toContain("units[0].unitId");
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(r.id)).toBe("PENDING");
    expect(await statusOf.unit(u.id)).toBe("AVAILABLE");
  });
});

describe("TEST-43 (AC-43): request is not PENDING", () => {
  it("TEST-43: checking out a CHECKED_OUT request again is 409 INVALID_STATE; it keeps its one loan", async () => {
    const w = await createCheckoutWorld(prisma);
    const u1 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0001" });
    const u2 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0002" });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const lineId = r.lines[0].id;
    const cookie = await signIn(app, "custodian1");
    const first = await postCheckout(app, cookie, r.id, checkoutBody(lineId, u1.id));
    expect(first.status).toBe(201);
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, cookie, r.id, checkoutBody(lineId, u2.id));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(res.body.error.message).toBe(
      `Request #${r.id} cannot be checked out because it is CHECKED_OUT, not PENDING.`,
    );
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(r.id)).toBe("CHECKED_OUT");
    const loans = await prisma.loan.findMany({ where: { requestLineId: lineId } });
    expect(loans.map((l) => l.unitId)).toEqual([u1.id]);
    expect(await statusOf.unit(u2.id)).toBe("AVAILABLE");
  });
});

describe("TEST-44 (AC-44): body or path fails the schema", () => {
  async function setup() {
    const w = await createCheckoutWorld(prisma);
    const u = await createUnit(prisma, { itemTypeId: w.arduino.id });
    const u2 = await createUnit(prisma, { itemTypeId: w.arduino.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    return { u, u2, r, lineId: r.lines[0].id, cookie: await signIn(app, "custodian1") };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;
  const cases: [string, (s: Setup) => unknown, string | null][] = [
    ["(a) empty object", () => ({}), "units"],
    ["(b) zero entries", () => ({ units: [] }), "units"],
    [
      "(c) two entries",
      (s) => ({ units: [{ lineId: s.lineId, unitId: s.u.id }, { lineId: s.lineId, unitId: s.u2.id }] }),
      "units",
    ],
    [
      "(d) unknown field in an entry",
      (s) => ({ units: [{ lineId: s.lineId, unitId: s.u.id, borrowerId: 3 }] }),
      "units[0].borrowerId",
    ],
    ["(e) unknown top-level field", (s) => ({ ...checkoutBody(s.lineId, s.u.id), checkedOutById: 1 }), "checkedOutById"],
    ["(f) unitId as a string", (s) => ({ units: [{ lineId: s.lineId, unitId: String(s.u.id) }] }), "units[0].unitId"],
    ["(f) unitId 0", (s) => ({ units: [{ lineId: s.lineId, unitId: 0 }] }), "units[0].unitId"],
  ];

  it.each(cases)("TEST-44 %s is 400 VALIDATION_FAILED and nothing changes", async (_name, body, field) => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, s.r.id, body(s));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).length).toBeGreaterThan(0);
    if (field) expect(detailFields(res)).toContain(field);
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(s.r.id)).toBe("PENDING");
    expect(await statusOf.unit(s.u.id)).toBe("AVAILABLE");
    expect(await statusOf.unit(s.u2.id)).toBe("AVAILABLE");
  });

  it("TEST-44 (g): malformed JSON is 400 VALIDATION_FAILED and nothing changes", async () => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await request(app)
      .post(`/api/requests/${s.r.id}/checkout`)
      .set("Content-Type", "application/json")
      .set("Cookie", s.cookie)
      .send('{"units": [');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(s.r.id)).toBe("PENDING");
  });

  it("TEST-44 (h): path id 'abc' is 400 VALIDATION_FAILED naming id and nothing changes", async () => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, "abc", checkoutBody(s.lineId, s.u.id));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === "id" || f.endsWith(".id"))).toBe(true);
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(s.r.id)).toBe("PENDING");
  });
});

describe("TEST-45 (AC-45): lineId is not a line of this request", () => {
  async function setup() {
    const w = await createCheckoutWorld(prisma);
    const u = await createUnit(prisma, { itemTypeId: w.arduino.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const r2 = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.arduino.id });
    return { u, r, r2, cookie: await signIn(app, "custodian1") };
  }

  it.each([
    ["(a) a line of another request", (s: Awaited<ReturnType<typeof setup>>) => s.r2.lines[0].id],
    ["(b) line 999999", () => 999999],
  ])("TEST-45 %s is 400 VALIDATION_FAILED naming units[0].lineId; neither request changes", async (_name, lineOf) => {
    const s = await setup();
    const lineId = lineOf(s);
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, s.r.id, checkoutBody(lineId, s.u.id));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toBe(`Line ${lineId} is not a line of request #${s.r.id}.`);
    expect(res.body.error.details[0]).toEqual({ field: "units[0].lineId", issue: `Not a line of request #${s.r.id}` });
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(s.r.id)).toBe("PENDING");
    expect(await statusOf.request(s.r2.id)).toBe("PENDING");
    expect(await statusOf.unit(s.u.id)).toBe("AVAILABLE");
    expect(await prisma.loan.count()).toBe(0);
  });
});

describe("TEST-46 (AC-46): unit does not exist", () => {
  async function setup() {
    const w = await createCheckoutWorld(prisma);
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
    const r2 = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.arduino.id });
    return { r, r2, cookie: await signIn(app, "custodian1") };
  }

  it.each([
    ["(a) with the request's own line", (s: Awaited<ReturnType<typeof setup>>) => s.r.lines[0].id],
    ["(b) with a line of another request (unit is checked before lineId)", (s: Awaited<ReturnType<typeof setup>>) => s.r2.lines[0].id],
  ])("TEST-46 %s: unit 999999 is 404 NOT_FOUND naming units[0].unitId", async (_name, lineOf) => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, s.r.id, checkoutBody(lineOf(s), 999999));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Unit 999999 does not exist.");
    expect(res.body.error.details[0]).toEqual({ field: "units[0].unitId", issue: "Unit does not exist" });
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
    expect(await statusOf.request(s.r.id)).toBe("PENDING");
    expect(await statusOf.request(s.r2.id)).toBe("PENDING");
  });
});
