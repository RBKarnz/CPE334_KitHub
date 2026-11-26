// F-05 cancel (contract F-05 sections 3 and 5.2): TEST-75 and TEST-76. Every rejection asserts
// Unchanged (snapshotRequestState).
import { RequestStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { detailFields, linesBody, postCancel, postRequest, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function world() {
  const b = await createBorrower(prisma, { username: "borrower1" });
  const b2 = await createBorrower(prisma, { username: "borrower2" });
  const arduino = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3", maxLoanDays: 14, maxQuantityPerRequest: 2 }, { AVAILABLE: 3 });
  const sensor = await createItemTypeWithUnits(prisma, { name: "HC-SR04 ultrasonic sensor", maxLoanDays: 14, maxQuantityPerRequest: 4 }, { AVAILABLE: 5 });
  return { b, b2, arduino, sensor, cookie: await signIn(app, "borrower1") };
}

async function expectRejected(promise: ReturnType<typeof postCancel>, status: number, code: string) {
  const before = await snapshotRequestState(prisma);
  const res = await promise;
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(res.body.error.code).toBe(code);
  expect(await snapshotRequestState(prisma)).toEqual(before);
  return res;
}

describe("TEST-75 (AC-75): a Borrower cancels their own PENDING and APPROVED requests", () => {
  it("TEST-75: each becomes CANCELLED with one entry; no unit changes; the item types can be requested again", async () => {
    const w = await world();
    const p = await createRequest(prisma, { borrowerId: w.b.id, itemTypeId: w.arduino.id, loanDays: 7 });
    const a = await createRequest(prisma, { borrowerId: w.b.id, itemTypeId: w.sensor.id, status: RequestStatus.APPROVED, loanDays: 7 });
    const unitsBefore = await prisma.unit.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } });

    for (const [r, from] of [
      [p, "PENDING"],
      [a, "APPROVED"],
    ] as const) {
      const res = await postCancel(app, w.cookie, r.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: r.id, status: "CANCELLED" });
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(RequestStatus.CANCELLED);
      const entries = await prisma.historyEntry.findMany({ where: { requestId: r.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entityType: "REQUEST",
        action: "STATUS_CHANGED",
        fromStatus: from,
        toStatus: "CANCELLED",
        actorType: "USER",
        actorUserId: w.b.id,
        details: null,
      });
    }
    expect(await prisma.unit.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } })).toEqual(unitsBefore);

    const again = await postRequest(app, w.cookie, linesBody(7, [w.arduino.id, 1], [w.sensor.id, 1]));
    expect(again.status).toBe(201);
  });
});

describe("TEST-76 (AC-76): requests that cannot be cancelled", () => {
  it.each([RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.CHECKED_OUT, RequestStatus.RETURNED])(
    "TEST-76 (a): a %s request is 409 INVALID_STATE naming the state; Unchanged",
    async (status) => {
      const w = await world();
      const r = await createRequest(prisma, {
        borrowerId: w.b.id,
        itemTypeId: w.arduino.id,
        status,
        ...(status === RequestStatus.REJECTED ? { rejectionReason: "Booked" } : {}),
      });
      const res = await expectRejected(postCancel(app, w.cookie, r.id), 409, "INVALID_STATE");
      expect(res.body.error.message).toBe(`Request #${r.id} cannot be cancelled because it is ${status}.`);
    },
  );

  it("TEST-76 (b): a body with a field is 400 naming it; Unchanged", async () => {
    const w = await world();
    const r = await createRequest(prisma, { borrowerId: w.b.id, itemTypeId: w.arduino.id });
    const res = await expectRejected(postCancel(app, w.cookie, r.id, { reason: "x" }), 400, "VALIDATION_FAILED");
    expect(detailFields(res)).toEqual(["reason"]);
  });

  it("TEST-76 (c): another Borrower's request is 404 with only the error; Unchanged", async () => {
    const w = await world();
    const r3 = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.arduino.id });
    const res = await expectRejected(postCancel(app, w.cookie, r3.id), 404, "NOT_FOUND");
    expect(res.body.error.message).toBe(`Request ${r3.id} does not exist.`);
  });
});
