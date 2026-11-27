// TEST-139 (AC-139): two simultaneous creates of one Borrower that each fit the 5-unit limit but
// exceed it together produce exactly one request (BR-14, DD-05 Borrower row lock; contract F-11 3.7).
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createItemType, createItemTypeWithUnits } from "../helpers/factories.js";
import { createLoanedRequest, fixClock } from "../helpers/overdue.js";
import { linesBody, postRequest } from "../helpers/requests.js";

const app = createTestApp();
afterEach(() => vi.useRealTimers());

describe("TEST-139 (AC-139): the limit holds under concurrency", () => {
  it("TEST-139: 3 held + 2 + 2 at once → one 201 and one 409 BORROW_LIMIT, 5 rounds", async () => {
    for (let round = 0; round < 5; round++) {
      vi.useRealTimers();
      await resetDb(prisma);
      const w = await createCheckoutWorld(prisma);
      const loaned = await createItemType(prisma, { name: "Loaned item" });
      await createLoanedRequest(prisma, {
        borrowerId: w.b1.id,
        custodianId: w.c1.id,
        dueAt: "2026-12-10T10:00:00.000Z",
        lines: [{ itemTypeId: loaned.id, count: 3 }],
      });
      const a = await createItemTypeWithUnits(prisma, { name: "Sensor A", maxQuantityPerRequest: 5 }, { AVAILABLE: 3 });
      const b = await createItemTypeWithUnits(prisma, { name: "Sensor B", maxQuantityPerRequest: 5 }, { AVAILABLE: 3 });
      fixClock("2026-12-04T03:00:00.000Z");
      const cookie = await signIn(app, "borrower1");

      const results = await Promise.all([
        postRequest(app, cookie, linesBody(3, [a.id, 2])),
        postRequest(app, cookie, linesBody(3, [b.id, 2])),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses, `round ${round}`).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe("BORROW_LIMIT");

      const open = await prisma.requestLine.aggregate({
        _sum: { quantity: true },
        where: { request: { borrowerId: w.b1.id, status: { in: ["PENDING", "APPROVED"] } } },
      });
      expect((open._sum.quantity ?? 0) + 3).toBe(5);
    }
  });
});
