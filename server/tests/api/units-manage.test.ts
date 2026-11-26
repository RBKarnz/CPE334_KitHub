// F-09 units: add, repair, retire (contract F-09 sections 3.2, 3.6, 5.3): TEST-115 to TEST-118.
// Units in MAINTENANCE are made with the factory, so F-09 needs no F-08 return call (F-09 8.1).
// Checkouts use the F-07 checkout of an APPROVED request, the one on staging.
import { LoanStatus, RequestStatus, UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import {
  detailFields,
  listedItemType,
  postUnit,
  repairUnit,
  retireUnit,
  snapshotCatalogState,
} from "../helpers/catalog.js";
import { checkoutBody, createActiveLoan, getUnits, postCheckout } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import {
  createBorrower,
  createCustodian,
  createItemType,
  createItemTypeWithUnits,
  createRequest,
  createUnit,
} from "../helpers/factories.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function people() {
  const custodian = await createCustodian(prisma, { username: "custodian1" });
  const borrower = await createBorrower(prisma, { username: "borrower1" });
  return { custodian, borrower, c: await signIn(app, "custodian1") };
}

/** TEST-117 and TEST-118 data: units A (AVAILABLE), M (MAINTENANCE), L (ON_LOAN, ACTIVE loan), X (RETIRED) of T. */
async function unitsWorld() {
  const s = await people();
  const t = await createItemType(prisma, { name: "Arduino Uno R3" });
  const a = await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-ARD-0001", status: UnitStatus.AVAILABLE });
  const m = await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-ARD-0002", status: UnitStatus.MAINTENANCE });
  const l = await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-ARD-0003", status: UnitStatus.AVAILABLE });
  const { loan } = await createActiveLoan(prisma, { borrowerId: s.borrower.id, custodianId: s.custodian.id, itemTypeId: t.id, unitId: l.id });
  const x = await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-ARD-0004", status: UnitStatus.RETIRED });
  return { ...s, t, a, m, l, loan, x };
}

/** An APPROVED request of the Borrower for one unit of `itemTypeId`, ready for the F-07 checkout. */
const approvedRequest = (borrowerId: number, itemTypeId: number) =>
  createRequest(prisma, { borrowerId, itemTypeId, status: RequestStatus.APPROVED, loanDays: 7 });

const unitHistory = (unitId: number) => prisma.historyEntry.findMany({ where: { unitId }, orderBy: { id: "asc" } });
const unitStatus = async (id: number) => (await prisma.unit.findUniqueOrThrow({ where: { id } })).status;

describe("TEST-115 (AC-115): add a unit", () => {
  it("TEST-115: stored trimmed and upper case as AVAILABLE; the count rises; one CREATED history entry by C", async () => {
    const s = await people();
    const t = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3" }, { AVAILABLE: 2 });
    const historyBefore = await prisma.historyEntry.count();

    const res = await postUnit(app, s.c, t.id, { assetTag: " kh-ard-0006 " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      assetTag: "KH-ARD-0006",
      status: "AVAILABLE",
      itemType: { id: t.id, name: "Arduino Uno R3" },
    });
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
      assetTag: "KH-ARD-0006",
      status: "AVAILABLE",
      itemTypeId: t.id,
    });
    expect((await listedItemType(app, s.c, t.id)).availableCount).toBe(3);

    expect(await prisma.historyEntry.count()).toBe(historyBefore + 1);
    const [entry] = await unitHistory(res.body.id);
    expect(entry).toMatchObject({
      entityType: "UNIT",
      action: "CREATED",
      fromStatus: null,
      toStatus: "AVAILABLE",
      actorType: "USER",
      actorUserId: s.custodian.id,
      unitId: res.body.id,
      requestId: null,
      loanId: null,
      details: { assetTag: "KH-ARD-0006" },
    });
  });
});

describe("TEST-116 (AC-116): a unit that cannot be added", () => {
  async function world() {
    const s = await people();
    const t = await createItemType(prisma, { name: "Arduino Uno R3" });
    const sItem = await createItemType(prisma, { name: "Servo motor SG90" });
    await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-ARD-0001" });
    return { ...s, t, sItem };
  }

  it.each([
    ["(a) ARD-0001", { assetTag: "ARD-0001" }, "assetTag"],
    ["(b) KH-ARD-1", { assetTag: "KH-ARD-1" }, "assetTag"],
    ["(e) KH-X-0001", { assetTag: "KH-X-0001" }, "assetTag"],
    ["(f) an extra status", { assetTag: "KH-SRV-0001", status: "ON_LOAN" }, "status"],
  ])("TEST-116 %s is 400 naming the field; Unchanged", async (_label, body, field) => {
    const s = await world();
    const before = await snapshotCatalogState(prisma);

    const res = await postUnit(app, s.c, s.sItem.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res)).toEqual([field]);
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });

  it.each([
    ["(c)", "KH-ARD-0001"],
    ["(d)", "kh-ard-0001"],
  ])(
    "TEST-116 %s %s, used by a unit of another item type, is 409 ASSET_TAG_TAKEN; Unchanged",
    async (_label, assetTag) => {
      const s = await world();
      const before = await snapshotCatalogState(prisma);

      const res = await postUnit(app, s.c, s.sItem.id, { assetTag });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: "ASSET_TAG_TAKEN", message: "Asset tag KH-ARD-0001 is already used." });
      expect(await snapshotCatalogState(prisma)).toEqual(before);
    },
  );

  it("TEST-116 (g): an unknown item type is 404; Unchanged", async () => {
    const s = await world();
    const before = await snapshotCatalogState(prisma);

    const res = await postUnit(app, s.c, 999999, { assetTag: "KH-SRV-0001" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "NOT_FOUND", message: "Item type 999999 does not exist." });
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });
});

describe("TEST-117 (AC-117): mark a unit repaired", () => {
  it("TEST-117: MAINTENANCE → AVAILABLE with one history entry; counted, listed and lendable; other states 409", async () => {
    const s = await unitsWorld();
    const countBefore = (await listedItemType(app, s.c, s.t.id)).availableCount;

    const a = await repairUnit(app, s.c, s.m.id);
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ id: s.m.id, assetTag: "KH-ARD-0002", status: "AVAILABLE", itemType: { id: s.t.id, name: "Arduino Uno R3" } });
    const history = await unitHistory(s.m.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      entityType: "UNIT",
      action: "STATUS_CHANGED",
      fromStatus: "MAINTENANCE",
      toStatus: "AVAILABLE",
      actorUserId: s.custodian.id,
      requestId: null,
      loanId: null,
      details: null,
    });
    expect((await listedItemType(app, s.c, s.t.id)).availableCount).toBe(countBefore + 1);

    for (const [unit, state] of [
      [s.a, "AVAILABLE"],
      [s.l, "ON_LOAN"],
      [s.x, "RETIRED"],
    ] as const) {
      const before = await snapshotCatalogState(prisma);
      const res = await repairUnit(app, s.c, unit.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: "INVALID_STATE",
        message: `Unit ${unit.assetTag} cannot be marked repaired because it is ${state}, not MAINTENANCE.`,
      });
      expect(await snapshotCatalogState(prisma)).toEqual(before);
    }

    const c = await getUnits(app, s.c, s.t.id, "status=AVAILABLE");
    expect(c.body.items.map((u: { assetTag: string }) => u.assetTag)).toEqual(["KH-ARD-0001", "KH-ARD-0002"]);

    const r = await approvedRequest(s.borrower.id, s.t.id);
    const d = await postCheckout(app, s.c, r.id, checkoutBody(r.lines[0].id, s.m.id));
    expect(d.status).toBe(201);
    expect(await unitStatus(s.m.id)).toBe("ON_LOAN");
  });
});

describe("TEST-118 (AC-118): retire a unit", () => {
  it("TEST-118: AVAILABLE and MAINTENANCE → RETIRED with history; ON_LOAN and RETIRED 409; a retired unit cannot be checked out", async () => {
    const s = await unitsWorld();
    const countBefore = (await listedItemType(app, s.c, s.t.id)).availableCount;

    const a = await retireUnit(app, s.c, s.a.id);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ id: s.a.id, status: "RETIRED", itemType: { id: s.t.id } });
    expect(await unitHistory(s.a.id)).toEqual([
      expect.objectContaining({ action: "STATUS_CHANGED", fromStatus: "AVAILABLE", toStatus: "RETIRED", actorUserId: s.custodian.id }),
    ]);
    expect((await listedItemType(app, s.c, s.t.id)).availableCount).toBe(countBefore - 1);

    const b = await retireUnit(app, s.c, s.m.id);
    expect(b.status).toBe(200);
    expect(b.body.status).toBe("RETIRED");
    expect(await unitHistory(s.m.id)).toEqual([
      expect.objectContaining({ action: "STATUS_CHANGED", fromStatus: "MAINTENANCE", toStatus: "RETIRED", actorUserId: s.custodian.id }),
    ]);

    let before = await snapshotCatalogState(prisma);
    const c = await retireUnit(app, s.c, s.l.id);
    expect(c.status).toBe(409);
    expect(c.body.error).toMatchObject({ code: "INVALID_STATE", message: "Unit KH-ARD-0003 cannot be retired because it is ON_LOAN." });
    expect(await unitStatus(s.l.id)).toBe("ON_LOAN");
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: s.loan.id } })).status).toBe(LoanStatus.ACTIVE);
    expect(await snapshotCatalogState(prisma)).toEqual(before);

    before = await snapshotCatalogState(prisma);
    const d = await retireUnit(app, s.c, s.a.id);
    expect(d.status).toBe(409);
    expect(d.body.error).toMatchObject({ code: "INVALID_STATE", message: "Unit KH-ARD-0001 cannot be retired because it is RETIRED." });
    expect(await snapshotCatalogState(prisma)).toEqual(before);

    const r = await approvedRequest(s.borrower.id, s.t.id);
    const loansBefore = await prisma.loan.count();
    const e = await postCheckout(app, s.c, r.id, checkoutBody(r.lines[0].id, s.a.id));
    expect(e.status).toBe(409);
    expect(e.body.error.code).toBe("UNIT_NOT_AVAILABLE");
    expect(await prisma.loan.count()).toBe(loansBefore);
    expect(await unitStatus(s.a.id)).toBe("RETIRED");
  });
});
