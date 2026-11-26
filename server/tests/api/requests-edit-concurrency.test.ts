// TEST-78 (AC-78): races on one request (contract F-05 3.7). Fresh data per round; the outcome is
// consistent and history holds one entry per successful call. F-06 is on staging, so the decision
// side of (c) to (e) uses the real POST /api/requests/:id/approve and /reject (F-05 8.1 planned a
// decideDirect helper only for the time before F-06 was merged).
import { RequestStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { linesBody, patchRequest, postCancel, postDecision } from "../helpers/requests.js";

const ROUNDS = 5;
const app = createTestApp();

async function setup() {
  await resetDb(prisma);
  const b = await createBorrower(prisma, { username: "borrower1" });
  await createCustodian(prisma, { username: "custodian1" });
  const arduino = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3", maxLoanDays: 14, maxQuantityPerRequest: 2 }, { AVAILABLE: 3 });
  const r = await createRequest(prisma, { borrowerId: b.id, itemTypeId: arduino.id, loanDays: 14 });
  return { r, arduino, b: await signIn(app, "borrower1"), c: await signIn(app, "custodian1") };
}

const stored = (id: number) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } });
const entries = (requestId: number, where: object = {}) => prisma.historyEntry.count({ where: { requestId, ...where } });

describe("TEST-78 (AC-78): concurrent edit, cancel and decision", () => {
  it(`TEST-78 (a): two cancels: one 200, one 409; one cancel entry, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const results = await Promise.all([postCancel(app, s.b, s.r.id), postCancel(app, s.b, s.r.id)]);
      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      expect(results.find((x) => x.status === 409)!.body.error.code).toBe("INVALID_STATE");
      expect(await entries(s.r.id, { toStatus: "CANCELLED" })).toBe(1);
    }
  }, 60_000);

  it(`TEST-78 (b): an edit and a cancel: CANCELLED; either both succeed with loanDays 7, or the edit gets 409, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const [edit, cancel] = await Promise.all([
        patchRequest(app, s.b, s.r.id, linesBody(7, [s.arduino.id, 1])),
        postCancel(app, s.b, s.r.id),
      ]);
      expect(cancel.status).toBe(200);
      const r = await stored(s.r.id);
      expect(r.status).toBe(RequestStatus.CANCELLED);
      expect(await entries(s.r.id, { toStatus: "CANCELLED" })).toBe(1);
      if (edit.status === 200) {
        expect(r.loanDays).toBe(7);
        expect(await entries(s.r.id, { action: "EDITED" })).toBe(1);
      } else {
        expect(edit.status).toBe(409);
        expect(edit.body.error.code).toBe("INVALID_STATE");
        expect(r.loanDays).toBe(14);
        expect(await entries(s.r.id, { action: "EDITED" })).toBe(0);
      }
    }
  }, 60_000);

  it(`TEST-78 (c): an edit and an approval: APPROVED; either both succeed (loanDays 7) or the edit gets 409, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const [edit, approve] = await Promise.all([
        patchRequest(app, s.b, s.r.id, linesBody(7, [s.arduino.id, 1])),
        postDecision(app, s.c, s.r.id, "approve", {}),
      ]);
      expect(approve.status).toBe(200);
      const r = await stored(s.r.id);
      expect(r.status).toBe(RequestStatus.APPROVED);
      if (edit.status === 200) expect(r.loanDays).toBe(7);
      else {
        expect(edit.status).toBe(409);
        expect(edit.body.error.code).toBe("INVALID_STATE");
        expect(r.loanDays).toBe(14);
      }
      expect(await entries(s.r.id, { action: "EDITED" })).toBe(edit.status === 200 ? 1 : 0);
    }
  }, 60_000);

  it(`TEST-78 (d): a cancel and a rejection: exactly one succeeds; one state entry, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const results = await Promise.all([
        postCancel(app, s.b, s.r.id),
        postDecision(app, s.c, s.r.id, "reject", { reason: "Booked for a class." }),
      ]);
      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      expect([RequestStatus.CANCELLED, RequestStatus.REJECTED]).toContain((await stored(s.r.id)).status);
      expect(await entries(s.r.id, { action: "STATUS_CHANGED" })).toBe(1);
    }
  }, 60_000);

  it(`TEST-78 (e): a cancel and an approval: the request ends CANCELLED, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();
      const [cancel, approve] = await Promise.all([postCancel(app, s.b, s.r.id), postDecision(app, s.c, s.r.id, "approve", {})]);
      expect(cancel.status).toBe(200);
      expect([200, 409]).toContain(approve.status);
      expect((await stored(s.r.id)).status).toBe(RequestStatus.CANCELLED);
      expect(await entries(s.r.id, { toStatus: "CANCELLED" })).toBe(1);
      expect(await entries(s.r.id, { toStatus: "APPROVED" })).toBe(approve.status === 200 ? 1 : 0);
    }
  }, 60_000);
});
