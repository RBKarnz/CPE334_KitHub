// F-05 edit (contract F-05 sections 3 and 5.1): TEST-72 to TEST-74. Every rejection asserts
// Unchanged (snapshotRequestState: counts, request rows, lines, units, history count).
import { RequestStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { addLine, createBorrower, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { detailFields, linesBody, patchRequest, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

const arduinoLimits = { name: "Arduino Uno R3", maxLoanDays: 14, maxQuantityPerRequest: 2 };
const sensorLimits = { name: "HC-SR04 ultrasonic sensor", maxLoanDays: 14, maxQuantityPerRequest: 4 };
const multimeterLimits = { name: "Digital multimeter", maxLoanDays: 3, maxQuantityPerRequest: 1 };

async function expectRejected(promise: ReturnType<typeof patchRequest>, status: number, code: string) {
  const before = await snapshotRequestState(prisma);
  const res = await promise;
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(res.body.error.code).toBe(code);
  expect(await snapshotRequestState(prisma)).toEqual(before);
  return res;
}

const byItemType = (lines: { itemTypeId: number; quantity: number }[]) =>
  [...lines].sort((a, b) => a.itemTypeId - b.itemTypeId).map(({ itemTypeId, quantity }) => ({ itemTypeId, quantity }));

describe("TEST-72 (AC-72): a Borrower edits their own PENDING request", () => {
  it("TEST-72: lines and loan length replaced; a kept item type keeps its line ID; one EDITED entry with before and after", async () => {
    const b = await createBorrower(prisma, { username: "borrower1" });
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 });
    const multimeter = await createItemTypeWithUnits(prisma, multimeterLimits, { AVAILABLE: 3 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    const r = await createRequest(prisma, { borrowerId: b.id, itemTypeId: arduino.id, quantity: 2, loanDays: 3 });
    const l20 = r.lines[0];
    const l21 = await addLine(prisma, r.id, multimeter.id, 1);
    const historyBefore = await prisma.historyEntry.count();

    const res = await patchRequest(app, await signIn(app, "borrower1"), r.id, linesBody(10, [arduino.id, 2], [sensor.id, 3]));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: r.id, status: "PENDING", loanDays: 10 });
    expect(res.body.lines).toEqual([
      { id: l20.id, itemType: { id: arduino.id, name: "Arduino Uno R3" }, quantity: 2, loans: [] },
      { id: expect.any(Number), itemType: { id: sensor.id, name: "HC-SR04 ultrasonic sensor" }, quantity: 3, loans: [] },
    ]);

    const stored = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: r.id }, include: { lines: { orderBy: { id: "asc" } } } });
    expect(stored).toMatchObject({ status: RequestStatus.PENDING, loanDays: 10 });
    expect(stored.createdAt.toISOString()).toBe(r.createdAt.toISOString());
    expect(stored.lines.map((l) => [l.itemTypeId, l.quantity])).toEqual([
      [arduino.id, 2],
      [sensor.id, 3],
    ]);
    expect(stored.lines[0].id).toBe(l20.id);
    expect(await prisma.requestLine.findUnique({ where: { id: l21.id } })).toBeNull();

    expect(await prisma.historyEntry.count()).toBe(historyBefore + 1);
    const entry = await prisma.historyEntry.findFirstOrThrow({ where: { requestId: r.id, action: "EDITED" } });
    expect(entry).toMatchObject({
      entityType: "REQUEST",
      actorType: "USER",
      actorUserId: b.id,
      fromStatus: null,
      toStatus: null,
      unitId: null,
      loanId: null,
    });
    expect(entry.details).toEqual({
      before: { loanDays: 3, lines: byItemType([{ itemTypeId: arduino.id, quantity: 2 }, { itemTypeId: multimeter.id, quantity: 1 }]) },
      after: { loanDays: 10, lines: byItemType([{ itemTypeId: arduino.id, quantity: 2 }, { itemTypeId: sensor.id, quantity: 3 }]) },
    });
  });
});

describe("TEST-73 (AC-73): an edit is checked as a new request", () => {
  async function world() {
    const b = await createBorrower(prisma, { username: "borrower1" });
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    const multimeter = await createItemTypeWithUnits(prisma, multimeterLimits, { AVAILABLE: 3 });
    const oscilloscope = await createItemTypeWithUnits(prisma, { name: "Oscilloscope", maxLoanDays: 3, maxQuantityPerRequest: 1 }, { MAINTENANCE: 1 });
    const r = await createRequest(prisma, { borrowerId: b.id, itemTypeId: arduino.id, loanDays: 14 });
    const r2 = await createRequest(prisma, { borrowerId: b.id, itemTypeId: sensor.id, loanDays: 7 });
    return { arduino, sensor, multimeter, oscilloscope, r, r2, cookie: await signIn(app, "borrower1") };
  }

  it.each([
    ["(a) two Arduino lines", (w: Awaited<ReturnType<typeof world>>) => linesBody(14, [w.arduino.id, 1], [w.arduino.id, 1]), "lines[1].itemTypeId"],
    ["(b) loanDays 0", (w: Awaited<ReturnType<typeof world>>) => linesBody(0, [w.arduino.id, 1]), "loanDays"],
    [
      "(c) a line with unitId",
      (w: Awaited<ReturnType<typeof world>>) => ({ lines: [{ itemTypeId: w.arduino.id, quantity: 1, unitId: 1 }], loanDays: 14 }),
      "lines[0].unitId",
    ],
  ])("TEST-73 %s is 400 naming the field; Unchanged", async (_label, body, field) => {
    const w = await world();
    const res = await expectRejected(patchRequest(app, w.cookie, w.r.id, body(w)), 400, "VALIDATION_FAILED");
    expect(detailFields(res)).toEqual([field]);
  });

  it("TEST-73 (d) to (g): the F-04 rule codes; BR-04 counts the Borrower's other open request; Unchanged", async () => {
    const w = await world();

    await expectRejected(patchRequest(app, w.cookie, w.r.id, linesBody(3, [w.multimeter.id, 2])), 409, "QUANTITY_LIMIT");

    const e = await expectRejected(
      patchRequest(app, w.cookie, w.r.id, linesBody(14, [w.arduino.id, 1], [w.multimeter.id, 1])),
      409,
      "LOAN_LENGTH_LIMIT",
    );
    expect(e.body.error.message).toBe("The loan length can be at most 3 days because of Digital multimeter.");

    const f = await expectRejected(patchRequest(app, w.cookie, w.r.id, linesBody(3, [w.oscilloscope.id, 1])), 409, "ITEM_TYPE_UNAVAILABLE");
    expect(f.body.error.message).toBe("Oscilloscope has no available units.");

    const g = await expectRejected(
      patchRequest(app, w.cookie, w.r.id, linesBody(14, [w.arduino.id, 1], [w.sensor.id, 1])),
      409,
      "DUPLICATE_OPEN_REQUEST",
    );
    expect(g.body.error.message).toBe(`You already have an open request for HC-SR04 ultrasonic sensor (Request #${w.r2.id}).`);
  });

  it("TEST-73 (h): the request's own Arduino line does not block it (F05-D3)", async () => {
    const w = await world();
    const res = await patchRequest(app, w.cookie, w.r.id, linesBody(14, [w.arduino.id, 2]));
    expect(res.status).toBe(200);
    expect(res.body.lines.map((l: { quantity: number }) => l.quantity)).toEqual([2]);
  });
});

describe("TEST-74 (AC-74): state, scope and a no-change edit", () => {
  async function world() {
    const b = await createBorrower(prisma, { username: "borrower1" });
    const b2 = await createBorrower(prisma, { username: "borrower2" });
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    const r = await createRequest(prisma, { borrowerId: b.id, itemTypeId: arduino.id, loanDays: 7 });
    await addLine(prisma, r.id, sensor.id, 2);
    const r3 = await createRequest(prisma, { borrowerId: b2.id, itemTypeId: arduino.id, loanDays: 7 });
    return { b, arduino, sensor, r, r3, cookie: await signIn(app, "borrower1") };
  }

  it.each([RequestStatus.APPROVED, RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.CHECKED_OUT])(
    "TEST-74 (a): editing a %s request is 409 INVALID_STATE naming the state; Unchanged",
    async (status) => {
      const w = await world();
      const other = await createRequest(prisma, {
        borrowerId: w.b.id,
        itemTypeId: w.sensor.id,
        status,
        loanDays: 7,
        ...(status === RequestStatus.REJECTED ? { rejectionReason: "Booked" } : {}),
      });
      const res = await expectRejected(patchRequest(app, w.cookie, other.id, linesBody(7, [w.sensor.id, 1])), 409, "INVALID_STATE");
      expect(res.body.error.message).toBe(`Request #${other.id} cannot be edited because it is ${status}, not PENDING.`);
    },
  );

  it("TEST-74 (b), (c): another Borrower's request and an unknown ID are 404 with only the error", async () => {
    const w = await world();
    for (const id of [w.r3.id, 999999]) {
      const res = await expectRejected(patchRequest(app, w.cookie, id, linesBody(7, [w.arduino.id, 1])), 404, "NOT_FOUND");
      expect(res.body.error.message).toBe(`Request ${id} does not exist.`);
      expect(JSON.stringify(res.body)).not.toMatch(/borrower2|Arduino/);
    }
  });

  it("TEST-74 (d): the stored lines in reverse order and the stored loanDays: 200, no history entry, updatedAt unchanged", async () => {
    const w = await world();
    const before = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: w.r.id } });
    const historyBefore = await prisma.historyEntry.count();

    const res = await patchRequest(app, w.cookie, w.r.id, linesBody(7, [w.sensor.id, 2], [w.arduino.id, 1]));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(w.r.id);
    expect(await prisma.historyEntry.count()).toBe(historyBefore);
    const after = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: w.r.id } });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });
});
