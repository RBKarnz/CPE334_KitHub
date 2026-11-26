// F-07 multi-unit checkout of an APPROVED request (contract F-07 sections 3 and 5): TEST-90 to
// TEST-95, TEST-97 and TEST-100, and the preview `days` cases of TEST-91 (F07-D4). Every
// rejection asserts that nothing changed (snapshotCheckoutState, F-03 3.6).
import request from "supertest";
import { RequestStatus, UnitStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld, postCheckout, snapshotCheckoutState } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { addLine, createItemType, createRequest, createUnit } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();
const NOW = "2026-11-30T03:00:00.000Z"; // Mon 30 Nov 2026, 10:00 ICT

beforeEach(async () => {
  await resetDb(prisma);
  // Only Date is faked; the sessions use the same faked clock for creation and expiry.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
});
afterEach(() => vi.useRealTimers());

/**
 * TEST-90 data: APPROVED request R of Borrower B with loanDays 7, line L1 Arduino Uno R3 × 2 and
 * line L2 HC-SR04 × 1; units A1, A2, A3 (Arduino) and S1 (HC-SR04) AVAILABLE.
 */
async function world(options: { loanDays?: number | null } = {}) {
  const w = await createCheckoutWorld(prisma);
  const sensor = await createItemType(prisma, { name: "HC-SR04 ultrasonic sensor", maxLoanDays: 14 });
  const a1 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0001" });
  const a2 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0002" });
  const a3 = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0003" });
  const s1 = await createUnit(prisma, { itemTypeId: sensor.id, assetTag: "KH-SR04-0001" });
  const loanDays = options.loanDays === undefined ? 7 : options.loanDays;
  const r = await createRequest(prisma, {
    borrowerId: w.b1.id,
    itemTypeId: w.arduino.id,
    quantity: 2,
    status: RequestStatus.APPROVED,
    ...(loanDays === null ? {} : { loanDays }),
    decidedById: w.c1.id,
    decidedAt: new Date("2026-11-29T03:00:00.000Z"),
  });
  const l1 = r.lines[0];
  const l2 = await addLine(prisma, r.id, sensor.id, 1);
  return { ...w, sensor, a1, a2, a3, s1, r, l1, l2, cookie: await signIn(app, "custodian1") };
}

type World = Awaited<ReturnType<typeof world>>;
const fullBody = (s: World) => ({
  units: [
    { lineId: s.l1.id, unitId: s.a1.id },
    { lineId: s.l1.id, unitId: s.a2.id },
    { lineId: s.l2.id, unitId: s.s1.id },
  ],
});
const status = {
  request: async (id: number) => (await prisma.borrowRequest.findUniqueOrThrow({ where: { id } })).status,
  unit: async (id: number) => (await prisma.unit.findUniqueOrThrow({ where: { id } })).status,
};

describe("TEST-90 (AC-90): checkout of an APPROVED request, one unit per quantity", () => {
  it("TEST-90: three ACTIVE loans, all units ON_LOAN, request CHECKED_OUT, one shared dueAt (Mon 7 Dec 17:00 ICT)", async () => {
    const s = await world();

    const res = await postCheckout(app, s.cookie, s.r.id, fullBody(s));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CHECKED_OUT");
    expect(res.body.dueAt).toBe("2026-12-07T10:00:00.000Z");
    const loans = res.body.lines.flatMap((l: { loans: unknown[] }) => l.loans);
    expect(loans).toHaveLength(3);
    for (const loan of loans) {
      expect(loan).toMatchObject({ status: "ACTIVE", dueAt: "2026-12-07T10:00:00.000Z", checkedOutBy: { id: s.c1.id } });
    }
    expect(res.body.lines[0].loans.map((l: { unit: { assetTag: string } }) => l.unit.assetTag).sort()).toEqual([
      "KH-ARD-0001",
      "KH-ARD-0002",
    ]);
    expect(res.body.lines[1].loans[0].unit.assetTag).toBe("KH-SR04-0001");

    expect(await status.request(s.r.id)).toBe("CHECKED_OUT");
    for (const u of [s.a1, s.a2, s.s1]) expect(await status.unit(u.id)).toBe("ON_LOAN");
    expect(await status.unit(s.a3.id)).toBe("AVAILABLE");
    const rows = await prisma.loan.findMany();
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.dueAt.toISOString()).toBe("2026-12-07T10:00:00.000Z");
  });
});

describe("TEST-91 (AC-91): the shared due date and the preview with days", () => {
  it("TEST-91 (a): loanDays 3 gives Thu 3 Dec 17:00 ICT", async () => {
    const s = await world({ loanDays: 3 });

    const res = await postCheckout(app, s.cookie, s.r.id, fullBody(s));

    expect(res.status).toBe(201);
    expect(res.body.dueAt).toBe("2026-12-03T10:00:00.000Z");
  });

  it("TEST-91 (b): without loanDays the smallest maxLoanDays of the item types is used (3, the multimeter)", async () => {
    const w = await createCheckoutWorld(prisma);
    const a = await createUnit(prisma, { itemTypeId: w.arduino.id });
    const m = await createUnit(prisma, { itemTypeId: w.multimeter.id });
    const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id, status: RequestStatus.APPROVED });
    const l2 = await addLine(prisma, r.id, w.multimeter.id, 1);

    const res = await postCheckout(app, await signIn(app, "custodian1"), r.id, {
      units: [
        { lineId: r.lines[0].id, unitId: a.id },
        { lineId: l2.id, unitId: m.id },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.dueAt).toBe("2026-12-03T10:00:00.000Z");
  });

  it("TEST-91 (c), (d): the preview with days 7 and with days 20 (above the maximum 14)", async () => {
    const s = await world();
    const preview = (query: string) =>
      request(app).get(`/api/item-types/${s.arduino.id}/due-date-preview?${query}`).set("Cookie", s.cookie);

    const seven = await preview("days=7");
    expect(seven.status).toBe(200);
    expect(seven.body).toEqual({ itemTypeId: s.arduino.id, maxLoanDays: 14, at: NOW, dueAt: "2026-12-07T10:00:00.000Z" });

    const twenty = await preview("days=20");
    expect(twenty.status).toBe(200);
    // Sun 20 Dec moves to Mon 21 Dec (D-21).
    expect(twenty.body.dueAt).toBe("2026-12-21T10:00:00.000Z");
  });

  it.each([
    ["days=0", "days"],
    ["days=366", "days"],
    ["days=1.5", "days"],
    ["days=abc", "days"],
    ["days=7&x=1", "x"],
  ])("TEST-91 (e): preview ?%s is 400 VALIDATION_FAILED naming %s", async (query, field) => {
    const s = await world();

    const res = await request(app).get(`/api/item-types/${s.arduino.id}/due-date-preview?${query}`).set("Cookie", s.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === field || f.endsWith(`.${field}`))).toBe(true);
  });
});

describe("TEST-92 (AC-92): only APPROVED can be checked out", () => {
  it.each([RequestStatus.PENDING, RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.CHECKED_OUT])(
    "TEST-92: a %s request is 409 INVALID_STATE naming the state, and nothing changes",
    async (state) => {
      const w = await createCheckoutWorld(prisma);
      const u = await createUnit(prisma, { itemTypeId: w.arduino.id });
      const r = await createRequest(prisma, {
        borrowerId: w.b1.id,
        itemTypeId: w.arduino.id,
        status: state,
        ...(state === RequestStatus.REJECTED ? { rejectionReason: "No." } : {}),
      });
      const cookie = await signIn(app, "custodian1");
      const before = await snapshotCheckoutState(prisma);

      const res = await postCheckout(app, cookie, r.id, { units: [{ lineId: r.lines[0].id, unitId: u.id }] });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE");
      expect(res.body.error.message).toBe(`Request #${r.id} cannot be checked out because it is ${state}, not APPROVED.`);
      expect(await snapshotCheckoutState(prisma)).toEqual(before);
    },
  );
});

describe("TEST-93 (AC-93): every line gets exactly its quantity", () => {
  it("TEST-93 (a) to (d): wrong counts, a missing line and a line of another request are 400, and nothing changes", async () => {
    const s = await world();
    const other = await createRequest(prisma, { borrowerId: s.b2.id, itemTypeId: s.arduino.id, status: RequestStatus.APPROVED });
    const e = (lineId: number, unitId: number) => ({ lineId, unitId });
    const cases: [string, unknown, string, string][] = [
      ["(a)", { units: [e(s.l1.id, s.a1.id), e(s.l2.id, s.s1.id)] }, "units", `Line ${s.l1.id} needs 2 units, got 1`],
      ["(b)", { units: [e(s.l1.id, s.a1.id), e(s.l1.id, s.a2.id)] }, "units", `Line ${s.l2.id} needs 1 unit, got 0`],
      [
        "(c)",
        { units: [e(s.l1.id, s.a1.id), e(s.l1.id, s.a2.id), e(other.lines[0].id, s.s1.id)] },
        "units[2].lineId",
        `Not a line of request #${s.r.id}`,
      ],
      [
        "(d)",
        { units: [e(s.l1.id, s.a1.id), e(s.l1.id, s.a2.id), e(s.l1.id, s.a3.id), e(s.l2.id, s.s1.id)] },
        "units",
        `Line ${s.l1.id} needs 2 units, got 3`,
      ],
    ];
    for (const [name, body, field, issue] of cases) {
      const before = await snapshotCheckoutState(prisma);
      const res = await postCheckout(app, s.cookie, s.r.id, body);
      expect(res.status, name).toBe(400);
      expect(res.body.error.code, name).toBe("VALIDATION_FAILED");
      expect(res.body.error.details, name).toContainEqual({ field, issue });
      expect(await snapshotCheckoutState(prisma), name).toEqual(before);
    }
    expect(await status.request(s.r.id)).toBe("APPROVED");
  });
});

describe("TEST-94 (AC-94): duplicates, too many entries, unknown fields", () => {
  it("TEST-94 (a): the same unit twice is 400 naming it", async () => {
    const s = await world();
    const before = await snapshotCheckoutState(prisma);

    const res = await postCheckout(app, s.cookie, s.r.id, {
      units: [
        { lineId: s.l1.id, unitId: s.a1.id },
        { lineId: s.l1.id, unitId: s.a1.id },
        { lineId: s.l2.id, unitId: s.s1.id },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: "units[1].unitId", issue: `Unit ${s.a1.id} is listed twice` });
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });

  it("TEST-94 (b), (c): 101 entries, or an unknown field in an entry, is 400 and nothing changes", async () => {
    const s = await world();
    const before = await snapshotCheckoutState(prisma);
    const many = { units: Array.from({ length: 101 }, () => ({ lineId: s.l1.id, unitId: s.a1.id })) };
    const extra = { units: [{ lineId: s.l1.id, unitId: s.a1.id, borrowerId: 3 }] };

    for (const [body, field] of [
      [many, "units"],
      [extra, "units[0].borrowerId"],
    ] as const) {
      const res = await postCheckout(app, s.cookie, s.r.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(detailFields(res)).toContain(field);
    }
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });
});

describe("TEST-95 (AC-95): one bad unit rolls the whole checkout back", () => {
  it.each([
    ["(a) ON_LOAN", UnitStatus.ON_LOAN, "UNIT_NOT_AVAILABLE"],
    ["(b) MAINTENANCE", UnitStatus.MAINTENANCE, "UNIT_NOT_AVAILABLE"],
    ["(c) RETIRED", UnitStatus.RETIRED, "UNIT_NOT_AVAILABLE"],
    ["(d) another item type", null, "UNIT_WRONG_ITEM_TYPE"],
  ] as const)("TEST-95 %s: the whole checkout is rejected with 409; A1 and A2 stay AVAILABLE, no loan, R APPROVED", async (_name, unitStatus, code) => {
    const s = await world();
    const bad = unitStatus
      ? await prisma.unit.update({ where: { id: s.s1.id }, data: { status: unitStatus } })
      : await createUnit(prisma, { itemTypeId: s.esp32.id, assetTag: "KH-ESP-0001" });
    const historyBefore = await prisma.historyEntry.count();

    const res = await postCheckout(app, s.cookie, s.r.id, {
      units: [
        { lineId: s.l1.id, unitId: s.a1.id },
        { lineId: s.l1.id, unitId: s.a2.id },
        { lineId: s.l2.id, unitId: bad.id },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
    expect(res.body.error.details[0].field).toBe("units[2].unitId");
    expect(await status.unit(s.a1.id)).toBe("AVAILABLE");
    expect(await status.unit(s.a2.id)).toBe("AVAILABLE");
    expect(await status.request(s.r.id)).toBe("APPROVED");
    expect(await prisma.loan.count()).toBe(0);
    expect(await prisma.historyEntry.count()).toBe(historyBefore);
  });
});

describe("TEST-97 (AC-97): history of a multi-unit checkout", () => {
  it("TEST-97: 1 request, 3 unit and 3 loan entries, all by C at checkedOutAt", async () => {
    const s = await world();
    const before = await prisma.historyEntry.count();

    const res = await postCheckout(app, s.cookie, s.r.id, fullBody(s));

    expect(res.status).toBe(201);
    const entries = await prisma.historyEntry.findMany({ where: { requestId: s.r.id }, orderBy: { id: "asc" } });
    expect(await prisma.historyEntry.count()).toBe(before + 7);
    expect(entries.filter((x) => x.entityType === "REQUEST")).toEqual([
      expect.objectContaining({ action: "STATUS_CHANGED", fromStatus: "APPROVED", toStatus: "CHECKED_OUT" }),
    ]);
    const unitEntries = entries.filter((x) => x.entityType === "UNIT");
    expect(unitEntries).toHaveLength(3);
    for (const x of unitEntries) expect(x).toMatchObject({ fromStatus: "AVAILABLE", toStatus: "ON_LOAN" });
    const loanEntries = entries.filter((x) => x.entityType === "LOAN");
    expect(loanEntries).toHaveLength(3);
    for (const x of loanEntries) expect(x).toMatchObject({ action: "CREATED", fromStatus: null, toStatus: "ACTIVE" });
    for (const x of entries) {
      expect(x.actorUserId).toBe(s.c1.id);
      expect(x.occurredAt.toISOString()).toBe(NOW);
    }
  });
});

describe("TEST-100 (AC-100): access", () => {
  it("TEST-100 (a), (b): a Borrower gets 403; no session gets 401 on checkout and on the loan list; nothing changes", async () => {
    const s = await world();
    const before = await snapshotCheckoutState(prisma);

    const asBorrower = await postCheckout(app, await signIn(app, "borrower1"), s.r.id, fullBody(s));
    expect(asBorrower.status).toBe(403);
    expect(Object.keys(asBorrower.body)).toEqual(["error"]);

    const noSession = await postCheckout(app, undefined, s.r.id, fullBody(s));
    expect(noSession.status).toBe(401);
    expect(Object.keys(noSession.body)).toEqual(["error"]);

    const loans = await request(app).get("/api/loans");
    expect(loans.status).toBe(401);
    expect(Object.keys(loans.body)).toEqual(["error"]);
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });
});
