// TEST-23 (AC-23): checkout writes the three history entries of contract F-03 3.10.
// TEST-24 (AC-24): history entries cannot be updated or deleted (BR-16, DD-07).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { checkoutBody, createCheckoutWorld, postCheckout } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function checkOutOne() {
  const w = await createCheckoutWorld(prisma);
  const u = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0007" });
  const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
  const cookie = await signIn(app, "custodian1");
  const historyBefore = await prisma.historyEntry.count();
  const res = await postCheckout(app, cookie, r.id, checkoutBody(r.lines[0].id, u.id));
  return { w, u, r, cookie, res, historyBefore };
}

describe("TEST-23 (AC-23): history entries for checkout", () => {
  it("TEST-23: exactly three entries (request, unit, loan) with the Custodian as actor at the loan's checkedOutAt", async () => {
    const { w, u, r, res, historyBefore } = await checkOutOne();
    expect(res.status).toBe(201);

    const entries = await prisma.historyEntry.findMany({ orderBy: { id: "asc" } });
    expect(entries.length - historyBefore).toBe(3);
    const loan = await prisma.loan.findFirstOrThrow({ where: { unitId: u.id } });
    const common = {
      actorType: "USER",
      actorUserId: w.c1.id,
      details: null,
    };

    const byEntity = Object.fromEntries(entries.map((e) => [e.entityType, e]));
    expect(byEntity.REQUEST).toMatchObject({
      ...common,
      action: "STATUS_CHANGED",
      fromStatus: "PENDING",
      toStatus: "CHECKED_OUT",
      requestId: r.id,
      unitId: null,
      loanId: null,
    });
    expect(byEntity.UNIT).toMatchObject({
      ...common,
      action: "STATUS_CHANGED",
      fromStatus: "AVAILABLE",
      toStatus: "ON_LOAN",
      requestId: r.id,
      unitId: u.id,
      loanId: null,
    });
    expect(byEntity.LOAN).toMatchObject({
      ...common,
      action: "CREATED",
      fromStatus: null,
      toStatus: "ACTIVE",
      requestId: r.id,
      unitId: u.id,
      loanId: loan.id,
    });
    for (const e of entries) expect(e.occurredAt.getTime()).toBe(loan.checkedOutAt.getTime());
  });
});

describe("TEST-24 (AC-24): history is append-only", () => {
  it("TEST-24 (a): UPDATE of a history entry is rejected by the trigger and the entry is unchanged", async () => {
    const { res } = await checkOutOne();
    expect(res.status).toBe(201);
    const h = await prisma.historyEntry.findFirstOrThrow({ orderBy: { id: "asc" } });
    const count = await prisma.historyEntry.count();

    await expect(
      prisma.$executeRaw`UPDATE history_entries SET "toStatus" = 'RETURNED' WHERE id = ${h.id}`,
    ).rejects.toThrow(/append-only/);

    expect(await prisma.historyEntry.findUniqueOrThrow({ where: { id: h.id } })).toEqual(h);
    expect(await prisma.historyEntry.count()).toBe(count);
  });

  it("TEST-24 (b): DELETE of a history entry is rejected by the trigger and the entry still exists", async () => {
    const { res } = await checkOutOne();
    expect(res.status).toBe(201);
    const h = await prisma.historyEntry.findFirstOrThrow({ orderBy: { id: "asc" } });
    const count = await prisma.historyEntry.count();

    await expect(prisma.$executeRaw`DELETE FROM history_entries WHERE id = ${h.id}`).rejects.toThrow(/append-only/);

    expect(await prisma.historyEntry.findUniqueOrThrow({ where: { id: h.id } })).toEqual(h);
    expect(await prisma.historyEntry.count()).toBe(count);
  });

  it.each(["patch", "delete"] as const)(
    "TEST-24: %s /api/history/:id as a Custodian is 404 NOT_FOUND, never 2xx",
    async (method) => {
      const { res, cookie } = await checkOutOne();
      expect(res.status).toBe(201);
      const h = await prisma.historyEntry.findFirstOrThrow({ orderBy: { id: "asc" } });

      const call = await request(app)
        [method](`/api/history/${h.id}`)
        .set("Cookie", cookie)
        .set("Content-Type", "application/json")
        .send({});

      expect(call.status).toBe(404);
      expect(call.body.error.code).toBe("NOT_FOUND");
      expect(await prisma.historyEntry.findUniqueOrThrow({ where: { id: h.id } })).toEqual(h);
    },
  );
});
