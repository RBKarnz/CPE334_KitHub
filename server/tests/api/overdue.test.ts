// TEST-132 (AC-132), API part, and TEST-133 (AC-133): the overdue status of a request and the
// overdue list (contract F-11 3.1, 5.1, 5.2; F11-D1, F11-D2, F11-D7, F11-D8).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createLoanedRequest, fixClock } from "../helpers/overdue.js";
import { postReturnLoan } from "../helpers/returns.js";
import { detailFields, getAs } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});
afterEach(() => vi.useRealTimers());

describe("TEST-132 (AC-132): overdue status through the API", () => {
  it("TEST-132 (f), (g): false at dueAt, true 1 ms later for both roles, false after the return", async () => {
    const w = await createCheckoutWorld(prisma);
    // Checked out Mon 30 Nov 10:00 ICT for 3 days: due Thu 3 Dec 17:00 ICT (D-21).
    const r = await createLoanedRequest(prisma, {
      borrowerId: w.b1.id,
      custodianId: w.c1.id,
      dueAt: "2026-12-03T10:00:00.000Z",
      lines: [{ itemTypeId: w.arduino.id, count: 1 }],
    });

    fixClock("2026-12-03T10:00:00.000Z");
    const borrower = await signIn(app, "borrower1");
    const custodian = await signIn(app, "custodian1");
    for (const cookie of [borrower, custodian]) {
      const res = await getAs(app, cookie, `/api/requests/${r.request.id}`);
      expect(res.status).toBe(200);
      expect(res.body.overdue).toBe(false);
    }

    vi.setSystemTime(new Date("2026-12-03T10:00:00.001Z"));
    for (const cookie of [borrower, custodian]) {
      const detail = await getAs(app, cookie, `/api/requests/${r.request.id}`);
      expect(detail.body.overdue).toBe(true);
      const list = await getAs(app, cookie, "/api/requests");
      expect(list.body.items.find((i: { id: number }) => i.id === r.request.id).overdue).toBe(true);
    }

    const returned = await postReturnLoan(app, custodian, r.loans[0].id, { condition: "GOOD" });
    expect(returned.status).toBe(200);
    expect(returned.body.overdue).toBe(false);
    expect((await getAs(app, borrower, `/api/requests/${r.request.id}`)).body.overdue).toBe(false);
  });
});

describe("TEST-133 (AC-133): GET /api/requests?overdue=true", () => {
  async function world() {
    const w = await createCheckoutWorld(prisma);
    const due = (b: number, dueAt: string) =>
      createLoanedRequest(prisma, { borrowerId: b, custodianId: w.c1.id, dueAt, lines: [{ itemTypeId: w.arduino.id, count: 1 }] });
    const r1 = await due(w.b1.id, "2026-12-01T10:00:00.000Z");
    const r2 = await due(w.b1.id, "2026-12-03T10:00:00.000Z");
    const r3 = await due(w.b1.id, "2026-12-10T10:00:00.000Z");
    const r4 = await due(w.b2.id, "2026-12-02T10:00:00.000Z");
    fixClock("2026-12-04T03:00:00.000Z"); // Fri 4 Dec 10:00 ICT
    return { ids: [r1, r2, r3, r4].map((r) => r.request.id) };
  }

  it("TEST-133 (a), (b): a Custodian gets every overdue request, a Borrower their own, earliest due first", async () => {
    const { ids } = await world();
    const [r1, r2, r3, r4] = ids;

    const all = await getAs(app, await signIn(app, "custodian1"), "/api/requests?overdue=true");
    expect(all.status).toBe(200);
    expect(all.body.items.map((i: { id: number }) => i.id)).toEqual([r1, r4, r2]);
    expect(all.body.items.every((i: { overdue: boolean }) => i.overdue)).toBe(true);
    expect(all.body.items.map((i: { id: number }) => i.id)).not.toContain(r3);

    const own = await getAs(app, await signIn(app, "borrower1"), "/api/requests?overdue=true");
    expect(own.status).toBe(200);
    expect(own.body.items.map((i: { id: number }) => i.id)).toEqual([r1, r2]);
  });

  it("TEST-133 (c) to (f): only overdue=true is accepted, not with status; no session gives 401", async () => {
    await world();
    const cookie = await signIn(app, "custodian1");
    for (const query of ["overdue=false", "overdue=yes", "overdue=true&status=CHECKED_OUT"]) {
      const res = await getAs(app, cookie, `/api/requests?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      // Query fields are named "overdue" or "query.overdue", as in TEST-99 (c).
      expect(detailFields(res).some((f) => f === "overdue" || f.endsWith(".overdue")), query).toBe(true);
    }
    const none = await getAs(app, undefined, "/api/requests?overdue=true");
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHENTICATED");
  });
});
