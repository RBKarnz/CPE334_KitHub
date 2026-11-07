// POST /api/requests: TEST-09 to TEST-12 and TEST-34 to TEST-38 (contract F-02 8.2).
import { RequestStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { detailFields, oneLine, postRequest, snapshotRequestState } from "../helpers/requests.js";

let b1: { id: number };
let b2: { id: number };
let arduino: { id: number };
let esp32: { id: number };
let oscilloscope: { id: number };
const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
  b1 = await createBorrower(prisma, { username: "borrower1" });
  b2 = await createBorrower(prisma, { username: "borrower2" });
  arduino = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3" }, { AVAILABLE: 2 });
  esp32 = await createItemTypeWithUnits(prisma, { name: "ESP32 DevKitC" }, { AVAILABLE: 2 });
  oscilloscope = await createItemTypeWithUnits(prisma, { name: "Oscilloscope" }, { MAINTENANCE: 1 });
});

async function expectRejected(promise: ReturnType<typeof postRequest>, status: number, code: string) {
  const before = await snapshotRequestState(prisma);
  const res = await promise;
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(res.body.error.code).toBe(code);
  expect(await snapshotRequestState(prisma)).toEqual(before);
  return res;
}

describe("TEST-09 (AC-09): a Borrower requests one available unit", () => {
  it("TEST-09: 201 PENDING, owned by the signed-in Borrower, units unchanged", async () => {
    const unitsBefore = await prisma.unit.findMany({ orderBy: { id: "asc" } });
    const res = await postRequest(app, await signIn(app, "borrower1"), oneLine(arduino.id));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      status: "PENDING",
      createdAt: expect.any(String),
      dueAt: null,
      borrower: { id: b1.id, username: "borrower1", displayName: expect.any(String) },
      lines: [{ id: expect.any(Number), itemType: { id: arduino.id, name: "Arduino Uno R3" }, quantity: 1, loans: [] }],
    });
    const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.borrowerId).toBe(b1.id);
    expect(row.status).toBe(RequestStatus.PENDING);
    expect(await prisma.unit.findMany({ orderBy: { id: "asc" } })).toEqual(unitsBefore);
  });
});

describe("TEST-10 (AC-10): BR-01, 0 available units", () => {
  it("TEST-10: 409 ITEM_TYPE_UNAVAILABLE and nothing stored", async () => {
    const res = await expectRejected(
      postRequest(app, await signIn(app, "borrower1"), oneLine(oscilloscope.id)),
      409,
      "ITEM_TYPE_UNAVAILABLE",
    );
    expect(res.body.error.message).toBe("Oscilloscope has no available units.");
    expect(detailFields(res)).toEqual(["lines[0].itemTypeId"]);
  });
});

describe("TEST-11 (AC-11): BR-04, one open request per item type", () => {
  it.each([RequestStatus.PENDING, RequestStatus.APPROVED])(
    "TEST-11: an existing %s request for the item type gives 409 DUPLICATE_OPEN_REQUEST",
    async (status) => {
      const open = await createRequest(prisma, { borrowerId: b1.id, itemTypeId: arduino.id, status });
      const res = await expectRejected(
        postRequest(app, await signIn(app, "borrower1"), oneLine(arduino.id)),
        409,
        "DUPLICATE_OPEN_REQUEST",
      );
      expect(res.body.error.message).toBe(
        `You already have an open request for Arduino Uno R3 (Request #${open.id}).`,
      );
    },
  );
});

describe("TEST-12 (AC-12): the owner cannot be chosen by the client", () => {
  it.each([
    ["borrowerId", () => ({ ...oneLine(arduino.id), borrowerId: b2.id })],
    ["role", () => ({ ...oneLine(arduino.id), role: "CUSTODIAN" })],
  ])("TEST-12: a body with %s is 400 VALIDATION_FAILED naming it", async (field, body) => {
    const res = await expectRejected(postRequest(app, await signIn(app, "borrower1"), body()), 400, "VALIDATION_FAILED");
    expect(detailFields(res)).toContain(field);
    expect(await prisma.borrowRequest.count({ where: { borrowerId: b2.id } })).toBe(0);
  });
});

describe("TEST-34 (AC-34): body schema", () => {
  it.each([
    ["no lines", {}, "lines"],
    ["empty lines", { lines: [] }, "lines"],
    ["two lines", { lines: [{ itemTypeId: 1, quantity: 1 }, { itemTypeId: 2, quantity: 1 }] }, "lines"],
    ["quantity 2", { lines: [{ itemTypeId: 1, quantity: 2 }] }, "lines[0].quantity"],
    ["string itemTypeId", { lines: [{ itemTypeId: "A", quantity: 1 }] }, "lines[0].itemTypeId"],
    ["itemTypeId 0", { lines: [{ itemTypeId: 0, quantity: 1 }] }, "lines[0].itemTypeId"],
    ["extra loanDays", { lines: [{ itemTypeId: 1, quantity: 1 }], loanDays: 7 }, "loanDays"],
    ["unknown field in a line", { lines: [{ itemTypeId: 1, quantity: 1, unitId: 4 }] }, "lines[0].unitId"],
  ])("TEST-34: %s gives 400 naming the field", async (_case, body, field) => {
    const res = await expectRejected(postRequest(app, await signIn(app, "borrower1"), body), 400, "VALIDATION_FAILED");
    expect(detailFields(res)).toContain(field);
  });
});

describe("TEST-35 (AC-35): unknown item type", () => {
  it("TEST-35: 404 NOT_FOUND naming lines[0].itemTypeId", async () => {
    const res = await expectRejected(postRequest(app, await signIn(app, "borrower1"), oneLine(999999)), 404, "NOT_FOUND");
    expect(detailFields(res)).toEqual(["lines[0].itemTypeId"]);
    expect(res.body.error.message).toBe("Item type 999999 does not exist.");
  });
});

describe("TEST-36 (AC-36): BR-04 limits", () => {
  it("TEST-36: other item types, closed requests and other Borrowers do not block; the same item type does", async () => {
    await createRequest(prisma, { borrowerId: b1.id, itemTypeId: arduino.id, status: RequestStatus.PENDING });
    await createRequest(prisma, { borrowerId: b1.id, itemTypeId: esp32.id, status: RequestStatus.CHECKED_OUT });
    const asB1 = await signIn(app, "borrower1");
    const asB2 = await signIn(app, "borrower2");

    expect((await postRequest(app, asB1, oneLine(esp32.id))).status).toBe(201);
    expect((await postRequest(app, asB2, oneLine(arduino.id))).status).toBe(201);
    await expectRejected(postRequest(app, asB1, oneLine(arduino.id)), 409, "DUPLICATE_OPEN_REQUEST");
  });
});

describe("TEST-38 (AC-38): BR-04 wins over BR-01 (F02-D1)", () => {
  it("TEST-38: open request and 0 available gives 409 DUPLICATE_OPEN_REQUEST naming both records", async () => {
    const r1 = await createRequest(prisma, { borrowerId: b1.id, itemTypeId: oscilloscope.id });
    const res = await expectRejected(
      postRequest(app, await signIn(app, "borrower1"), oneLine(oscilloscope.id)),
      409,
      "DUPLICATE_OPEN_REQUEST",
    );
    expect(res.body.error.message).toBe(`You already have an open request for Oscilloscope (Request #${r1.id}).`);
  });
});
