// TEST-18 (AC-18): a Custodian sees every PENDING request, oldest first (contract F-03 5.1, F03-D2).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest } from "../helpers/factories.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

describe("TEST-18 (AC-18): Custodian's pending list", () => {
  it("TEST-18: lists every Borrower's PENDING requests oldest first, with borrower, line and createdAt", async () => {
    const w = await createCheckoutWorld(prisma);
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 6, 6, minute));
    // Created in an order that differs from createdAt, so the order comes from createdAt.
    const r3 = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.esp32.id, createdAt: at(30) });
    const r1 = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id, createdAt: at(10) });
    const r2 = await createRequest(prisma, { borrowerId: w.b2.id, itemTypeId: w.arduino.id, createdAt: at(20) });
    const r4 = await createRequest(prisma, {
      borrowerId: w.b2.id,
      itemTypeId: w.multimeter.id,
      status: "CHECKED_OUT",
      createdAt: at(5),
    });

    const res = await request(app)
      .get("/api/requests?status=PENDING")
      .set("Cookie", await signIn(app, "custodian1"));

    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: number }) => i.id);
    expect(ids).toEqual([r1.id, r2.id, r3.id]);
    expect(ids).not.toContain(r4.id);

    const owners = { [r1.id]: w.b1, [r2.id]: w.b2, [r3.id]: w.b1 };
    const itemTypes = { [r1.id]: w.arduino, [r2.id]: w.arduino, [r3.id]: w.esp32 };
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(["borrower", "createdAt", "dueAt", "id", "lines", "status"]);
      expect(item.status).toBe("PENDING");
      expect(item.dueAt).toBeNull();
      const owner = owners[item.id];
      expect(item.borrower).toEqual({ id: owner.id, username: owner.username, displayName: owner.displayName });
      expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(item.lines).toHaveLength(1);
      expect(Object.keys(item.lines[0]).sort()).toEqual(["id", "itemType", "loans", "quantity"]);
      expect(item.lines[0]).toMatchObject({
        id: expect.any(Number),
        itemType: { id: itemTypes[item.id].id, name: itemTypes[item.id].name },
        quantity: 1,
        loans: [],
      });
    }
    expect(res.body.items[0].createdAt).toBe(at(10).toISOString());
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});
