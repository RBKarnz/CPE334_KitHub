// F-04 multi-line requests (contract F-04 sections 3 and 5): TEST-64 to TEST-69, API parts. Every
// rejection asserts that nothing is stored (snapshotRequestState). Limits are the D-08 ones:
// Arduino Uno R3 (14 days, 2), HC-SR04 ultrasonic sensor (14 days, 4), Digital multimeter (3 days, 1).
import { RequestStatus, UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { patchItemType } from "../helpers/catalog.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { detailFields, linesBody, postRequest, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

const arduinoLimits = { name: "Arduino Uno R3", maxLoanDays: 14, maxQuantityPerRequest: 2 };
const sensorLimits = { name: "HC-SR04 ultrasonic sensor", maxLoanDays: 14, maxQuantityPerRequest: 4 };
const multimeterLimits = { name: "Digital multimeter", maxLoanDays: 3, maxQuantityPerRequest: 1 };

async function people() {
  const b = await createBorrower(prisma, { username: "borrower1" });
  await createCustodian(prisma, { username: "custodian1" });
  return { b, cookie: await signIn(app, "borrower1") };
}

/** The call, its status and code, and that nothing was stored. */
async function expectRejected(promise: ReturnType<typeof postRequest>, status: number, code: string) {
  const before = await snapshotRequestState(prisma);
  const res = await promise;
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(res.body.error.code).toBe(code);
  expect(await snapshotRequestState(prisma)).toEqual(before);
  return res;
}

describe("TEST-64 (AC-64): a request with several lines and one loan length", () => {
  it("TEST-64: 201 PENDING with loanDays and the lines in body order; one CREATED entry; units unchanged", async () => {
    const s = await people();
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    const unitsBefore = await prisma.unit.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } });

    const res = await postRequest(app, s.cookie, linesBody(7, [arduino.id, 2], [sensor.id, 1]));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING", loanDays: 7, dueAt: null, borrower: { id: s.b.id } });
    expect(res.body.lines).toEqual([
      { id: expect.any(Number), itemType: { id: arduino.id, name: "Arduino Uno R3" }, quantity: 2, loans: [] },
      { id: expect.any(Number), itemType: { id: sensor.id, name: "HC-SR04 ultrasonic sensor" }, quantity: 1, loans: [] },
    ]);

    const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: res.body.id }, include: { lines: { orderBy: { id: "asc" } } } });
    expect(row).toMatchObject({ borrowerId: s.b.id, loanDays: 7, status: RequestStatus.PENDING });
    expect(row.lines.map((l) => [l.itemTypeId, l.quantity])).toEqual([
      [arduino.id, 2],
      [sensor.id, 1],
    ]);
    const history = await prisma.historyEntry.findMany();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      entityType: "REQUEST",
      action: "CREATED",
      fromStatus: null,
      toStatus: "PENDING",
      actorType: "USER",
      actorUserId: s.b.id,
      requestId: row.id,
    });
    expect(history[0].occurredAt.toISOString()).toBe(row.createdAt.toISOString());
    expect(await prisma.unit.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } })).toEqual(unitsBefore);
  });
});

describe("TEST-65 (AC-65): body shape", () => {
  let arduinoId = 0;
  const valid = () => ({ lines: [{ itemTypeId: arduinoId, quantity: 1 }], loanDays: 7 });
  const line = (extra: object = {}) => ({ itemTypeId: arduinoId, quantity: 1, ...extra });

  it.each([
    ["(a) no lines", () => ({ loanDays: 7 }), "lines"],
    ["(b) lines []", () => ({ ...valid(), lines: [] }), "lines"],
    ["(c) 11 lines", () => ({ ...valid(), lines: Array.from({ length: 11 }, (_, i) => ({ itemTypeId: i + 1, quantity: 1 })) }), "lines"],
    ["(d) Arduino twice", () => ({ ...valid(), lines: [line(), line()] }), "lines[1].itemTypeId"],
    ["(e) quantity 0", () => ({ ...valid(), lines: [line({ quantity: 0 })] }), "lines[0].quantity"],
    ["(e) quantity 1.5", () => ({ ...valid(), lines: [line({ quantity: 1.5 })] }), "lines[0].quantity"],
    ["(e) quantity 11", () => ({ ...valid(), lines: [line({ quantity: 11 })] }), "lines[0].quantity"],
    ["(f) no loanDays", () => ({ lines: [line()] }), "loanDays"],
    ["(g) loanDays 0", () => ({ ...valid(), loanDays: 0 }), "loanDays"],
    ["(g) loanDays 366", () => ({ ...valid(), loanDays: 366 }), "loanDays"],
    ["(g) loanDays \"7\"", () => ({ ...valid(), loanDays: "7" }), "loanDays"],
    ["(h) a line with unitId", () => ({ ...valid(), lines: [line({ unitId: 4 })] }), "lines[0].unitId"],
    ["(i) a line with assetTag", () => ({ ...valid(), lines: [line({ assetTag: "KH-ARD-0001" })] }), "lines[0].assetTag"],
    ["(j) top-level borrowerId", () => ({ ...valid(), borrowerId: 1 }), "borrowerId"],
  ])("TEST-65 %s: 400 with exactly one detail naming the field; nothing stored", async (_label, body, field) => {
    const s = await people();
    arduinoId = (await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 })).id;

    const res = await expectRejected(postRequest(app, s.cookie, body()), 400, "VALIDATION_FAILED");

    expect(detailFields(res)).toEqual([field]);
  });
});

describe("TEST-66 (AC-66): BR-07, quantity up to the item type's maximum", () => {
  async function world() {
    const s = await people();
    const multimeter = await createItemTypeWithUnits(prisma, multimeterLimits, { AVAILABLE: 3 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    return { ...s, multimeter, sensor };
  }

  it("TEST-66 (a): multimeter × 2 is 409 QUANTITY_LIMIT naming lines[0].quantity", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(3, [s.multimeter.id, 2])), 409, "QUANTITY_LIMIT");
    expect(res.body.error.message).toBe("You can request at most 1 Digital multimeter at a time.");
    expect(res.body.error.details).toEqual([{ field: "lines[0].quantity", issue: "Maximum 1" }]);
  });

  it("TEST-66 (b): HC-SR04 × 4 and multimeter × 2 names only lines[1].quantity", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(3, [s.sensor.id, 4], [s.multimeter.id, 2])), 409, "QUANTITY_LIMIT");
    expect(detailFields(res)).toEqual(["lines[1].quantity"]);
  });

  it("TEST-66 (c): HC-SR04 × 4, its maximum, is accepted", async () => {
    const s = await world();
    const res = await postRequest(app, s.cookie, linesBody(3, [s.sensor.id, 4]));
    expect(res.status).toBe(201);
  });

  it("TEST-66 (d): multimeter × 2 and HC-SR04 × 5: the message names the multimeter, details both lines", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(3, [s.multimeter.id, 2], [s.sensor.id, 5])), 409, "QUANTITY_LIMIT");
    expect(res.body.error.message).toBe("You can request at most 1 Digital multimeter at a time.");
    expect(res.body.error.details).toEqual([
      { field: "lines[0].quantity", issue: "Maximum 1" },
      { field: "lines[1].quantity", issue: "Maximum 4" },
    ]);
  });

  it("TEST-66 (e): after F-09 lowers HC-SR04 to 2 per request, HC-SR04 × 3 is 409 naming the new maximum", async () => {
    const s = await world();
    const patched = await patchItemType(app, await signIn(app, "custodian1"), s.sensor.id, { maxQuantityPerRequest: 2 });
    expect(patched.status).toBe(200);

    const res = await expectRejected(postRequest(app, s.cookie, linesBody(3, [s.sensor.id, 3])), 409, "QUANTITY_LIMIT");
    expect(res.body.error.message).toBe("You can request at most 2 HC-SR04 ultrasonic sensor at a time.");
    expect(res.body.error.details).toEqual([{ field: "lines[0].quantity", issue: "Maximum 2" }]);
  });
});

describe("TEST-67 (AC-67): BR-08, one loan length up to the smallest maximum", () => {
  async function world() {
    const s = await people();
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 });
    const multimeter = await createItemTypeWithUnits(prisma, multimeterLimits, { AVAILABLE: 3 });
    return { ...s, arduino, multimeter };
  }

  it("TEST-67 (a): both for 7 days is 409 LOAN_LENGTH_LIMIT naming the multimeter", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(7, [s.arduino.id, 1], [s.multimeter.id, 1])), 409, "LOAN_LENGTH_LIMIT");
    expect(res.body.error.message).toBe("The loan length can be at most 3 days because of Digital multimeter.");
    expect(res.body.error.details).toEqual([{ field: "loanDays", issue: "Maximum 3 (Digital multimeter)" }]);
  });

  it("TEST-67 (b), (c): both for 3 days and Arduino alone for 14 days are accepted", async () => {
    const s = await world();
    const b = await postRequest(app, s.cookie, linesBody(3, [s.arduino.id, 1], [s.multimeter.id, 1]));
    expect(b.status).toBe(201);
    expect(b.body.loanDays).toBe(3);

    await resetDb(prisma);
    const t = await world();
    const c = await postRequest(app, t.cookie, linesBody(14, [t.arduino.id, 1]));
    expect(c.status).toBe(201);
  });

  it("TEST-67 (d): Arduino alone for 15 days is 409 naming Arduino Uno R3", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(15, [s.arduino.id, 1])), 409, "LOAN_LENGTH_LIMIT");
    expect(res.body.error.message).toBe("The loan length can be at most 14 days because of Arduino Uno R3.");
  });

  it("TEST-67 (e): after F-09 lowers Arduino to 7 days, Arduino for 10 days is 409 at most 7 days", async () => {
    const s = await world();
    const patched = await patchItemType(app, await signIn(app, "custodian1"), s.arduino.id, { maxLoanDays: 7 });
    expect(patched.status).toBe(200);

    const res = await expectRejected(postRequest(app, s.cookie, linesBody(10, [s.arduino.id, 1])), 409, "LOAN_LENGTH_LIMIT");
    expect(res.body.error.message).toBe("The loan length can be at most 7 days because of Arduino Uno R3.");
  });
});

describe("TEST-68 (AC-68): BR-01, enough available units on every line", () => {
  async function world() {
    const s = await people();
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 1, ON_LOAN: 2 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    const oscilloscope = await createItemTypeWithUnits(prisma, { name: "Oscilloscope", maxLoanDays: 3, maxQuantityPerRequest: 1 }, {});
    return { ...s, arduino, sensor, oscilloscope };
  }

  it("TEST-68 (a): HC-SR04 × 1 and Arduino × 2 with 1 available: 409 naming lines[1]; nothing stored, not even the HC-SR04 line", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(7, [s.sensor.id, 1], [s.arduino.id, 2])), 409, "ITEM_TYPE_UNAVAILABLE");
    expect(res.body.error.message).toBe("Arduino Uno R3 has only 1 available unit; you asked for 2.");
    expect(res.body.error.details).toEqual([{ field: "lines[1].itemTypeId", issue: "1 available" }]);
    expect(await prisma.requestLine.count()).toBe(0);
  });

  it("TEST-68 (b): Oscilloscope with none available: \"has no available units\"", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(3, [s.oscilloscope.id, 1])), 409, "ITEM_TYPE_UNAVAILABLE");
    expect(res.body.error.message).toBe("Oscilloscope has no available units.");
  });

  it("TEST-68 (c): Arduino × 1 with 1 available is accepted", async () => {
    const s = await world();
    expect((await postRequest(app, s.cookie, linesBody(7, [s.arduino.id, 1]))).status).toBe(201);
  });

  it("TEST-68: an unknown item type on a later line is 404 naming that line", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(7, [s.sensor.id, 1], [999999, 1])), 404, "NOT_FOUND");
    expect(res.body.error.message).toBe("Item type 999999 does not exist.");
    expect(detailFields(res)).toEqual(["lines[1].itemTypeId"]);
  });
});

describe("TEST-69 (AC-69): BR-04 and the rule order", () => {
  async function world() {
    const s = await people();
    const b2 = await createBorrower(prisma, { username: "borrower2" });
    const arduino = await createItemTypeWithUnits(prisma, arduinoLimits, { AVAILABLE: 3 });
    const sensor = await createItemTypeWithUnits(prisma, sensorLimits, { AVAILABLE: 5 });
    const multimeter = await createItemTypeWithUnits(prisma, multimeterLimits, { ON_LOAN: 1 });
    const r1 = await createRequest(prisma, { borrowerId: s.b.id, itemTypeId: arduino.id, status: RequestStatus.PENDING });
    await createRequest(prisma, { borrowerId: b2.id, itemTypeId: sensor.id, status: RequestStatus.PENDING });
    return { ...s, arduino, sensor, multimeter, r1 };
  }

  it("TEST-69 (a): a line whose item type is on an open request is 409 DUPLICATE_OPEN_REQUEST naming R1 and lines[1]", async () => {
    const s = await world();
    const res = await expectRejected(postRequest(app, s.cookie, linesBody(7, [s.sensor.id, 1], [s.arduino.id, 1])), 409, "DUPLICATE_OPEN_REQUEST");
    expect(res.body.error.message).toBe(`You already have an open request for Arduino Uno R3 (Request #${s.r1.id}).`);
    expect(res.body.error.details).toEqual([{ field: "lines[1].itemTypeId", issue: `Open request #${s.r1.id} has this item type` }]);
  });

  it("TEST-69 (b): when BR-04, BR-07, BR-08 and BR-01 all fail, the code is DUPLICATE_OPEN_REQUEST", async () => {
    const s = await world();
    await expectRejected(postRequest(app, s.cookie, linesBody(14, [s.arduino.id, 1], [s.multimeter.id, 2])), 409, "DUPLICATE_OPEN_REQUEST");
  });

  it("TEST-69 (c): another Borrower's open request for HC-SR04 does not block", async () => {
    const s = await world();
    expect((await postRequest(app, s.cookie, linesBody(7, [s.sensor.id, 1]))).status).toBe(201);
  });

  it("TEST-69: without BR-04, a quantity over the maximum wins over the loan length and the availability", async () => {
    const s = await world();
    await expectRejected(postRequest(app, s.cookie, linesBody(14, [s.multimeter.id, 2])), 409, "QUANTITY_LIMIT");
    await expectRejected(postRequest(app, s.cookie, linesBody(14, [s.multimeter.id, 1])), 409, "LOAN_LENGTH_LIMIT");
    await expectRejected(postRequest(app, s.cookie, linesBody(3, [s.multimeter.id, 1])), 409, "ITEM_TYPE_UNAVAILABLE");
    expect(await prisma.unit.count({ where: { itemTypeId: s.multimeter.id, status: UnitStatus.AVAILABLE } })).toBe(0);
  });
});
