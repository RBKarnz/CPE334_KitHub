// TEST-86 (AC-86): two Custodians decide the same PENDING request at the same time; exactly one
// wins (contract F-06 3.7). Each round starts from an empty database.
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemType, createRequest } from "../helpers/factories.js";
import { postDecision } from "../helpers/requests.js";

const ROUNDS = 5;
const app = createTestApp();

async function setup() {
  await resetDb(prisma);
  const c1 = await createCustodian(prisma, { username: "custodian1" });
  const c2 = await createCustodian(prisma, { username: "custodian2" });
  const a = await createBorrower(prisma, { username: "borrower1" });
  const t = await createItemType(prisma);
  const r = await createRequest(prisma, { borrowerId: a.id, itemTypeId: t.id });
  return { c1, c2, r, cookies: [await signIn(app, "custodian1"), await signIn(app, "custodian2")] };
}

describe("TEST-86 (AC-86): simultaneous decisions", () => {
  it(`TEST-86 (a): approve and approve give one 200 and one 409, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();

      const results = await Promise.all([
        postDecision(app, s.cookies[0], s.r.id, "approve", {}),
        postDecision(app, s.cookies[1], s.r.id, "approve", {}),
      ]);

      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      const winner = results.find((x) => x.status === 200)!;
      const loser = results.find((x) => x.status === 409)!;
      expect(loser.body.error.code).toBe("INVALID_STATE");
      expect(loser.body.error.message).toContain("because it is APPROVED, not PENDING.");
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: s.r.id } });
      expect(row.status).toBe("APPROVED");
      expect(row.decidedById).toBe(winner.body.decidedBy.id);
      expect(await prisma.historyEntry.count({ where: { requestId: s.r.id, action: "STATUS_CHANGED" } })).toBe(1);
    }
  }, 60_000);

  it(`TEST-86 (b): approve and reject give one 200 and one 409; the reason is set only when reject won, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const s = await setup();

      const results = await Promise.all([
        postDecision(app, s.cookies[0], s.r.id, "approve", {}),
        postDecision(app, s.cookies[1], s.r.id, "reject", { reason: "Broken cable." }),
      ]);

      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      const winner = results.find((x) => x.status === 200)!;
      expect(results.find((x) => x.status === 409)!.body.error.code).toBe("INVALID_STATE");
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: s.r.id } });
      expect(row.status).toBe(winner.body.status);
      expect(row.decidedById).toBe(winner.body.decidedBy.id);
      expect(row.rejectionReason).toBe(row.status === "REJECTED" ? "Broken cable." : null);
      const entries = await prisma.historyEntry.findMany({ where: { requestId: s.r.id, action: "STATUS_CHANGED" } });
      expect(entries).toHaveLength(1);
      expect(entries[0].toStatus).toBe(row.status);
    }
  }, 60_000);
});
