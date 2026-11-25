// TEST-87 (AC-87): approve and reject are Custodian only (contract F-06 3.5, 5.1, 5.2). Every
// call sends Content-Type: application/json and a valid body, so it reaches the session and role
// checks that follow 415.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn, signOut } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemType, createRequest } from "../helpers/factories.js";
import { postDecision, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

const calls = [
  ["approve", {}],
  ["reject", { reason: "Broken cable." }],
] as const;

async function setup() {
  await createCustodian(prisma, { username: "custodian1" });
  const a = await createBorrower(prisma, { username: "borrower1" });
  const t = await createItemType(prisma);
  return createRequest(prisma, { borrowerId: a.id, itemTypeId: t.id });
}

describe("TEST-87 (AC-87): Borrowers and calls without a session cannot decide", () => {
  it.each(calls)("TEST-87 (a): %s as the owning Borrower is 403 FORBIDDEN with only the error", async (decision, body) => {
    const r = await setup();
    const cookie = await signIn(app, "borrower1");
    const before = await snapshotRequestState(prisma);

    const res = await postDecision(app, cookie, r.id, decision, body);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });

  it.each(calls)("TEST-87 (b): %s with no cookie and with a signed-out session is 401 with only the error", async (decision, body) => {
    const r = await setup();
    const ended = await signIn(app, "custodian1");
    await signOut(app, ended);
    const before = await snapshotRequestState(prisma);

    for (const cookie of [undefined, ended]) {
      const res = await postDecision(app, cookie, r.id, decision, body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
      expect(Object.keys(res.body)).toEqual(["error"]);
    }
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });
});
