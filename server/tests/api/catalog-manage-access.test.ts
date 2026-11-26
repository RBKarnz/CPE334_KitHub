// TEST-120 (AC-120): the seven catalog management endpoints are Custodian only (contract F-09 5).
// Every call sends Content-Type: application/json and a valid body, so it reaches the session and
// role checks that follow 415.
import { UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn, signOut } from "../helpers/auth.js";
import { sendJson, snapshotCatalogState } from "../helpers/catalog.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCategory, createItemType, createUnit } from "../helpers/factories.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function setup() {
  await createBorrower(prisma, { username: "borrower1" });
  const k = await createCategory(prisma, { name: "Instruments" });
  const t = await createItemType(prisma, { categoryId: k.id, name: "Digital multimeter" });
  const u = await createUnit(prisma, { itemTypeId: t.id, assetTag: "KH-DMM-0001", status: UnitStatus.MAINTENANCE });
  const calls: [string, "post" | "patch", string, unknown][] = [
    ["POST /api/categories", "post", "/api/categories", { name: "Robotics", defaultMaxLoanDays: 7, defaultMaxQuantity: 2 }],
    ["PATCH /api/categories/:id", "patch", `/api/categories/${k.id}`, { defaultMaxQuantity: 3 }],
    ["POST /api/item-types", "post", "/api/item-types", { categoryId: k.id, name: "Oscilloscope" }],
    ["PATCH /api/item-types/:id", "patch", `/api/item-types/${t.id}`, { maxQuantityPerRequest: 1 }],
    ["POST /api/item-types/:id/units", "post", `/api/item-types/${t.id}/units`, { assetTag: "KH-DMM-0002" }],
    ["POST /api/units/:id/repair", "post", `/api/units/${u.id}/repair`, {}],
    ["POST /api/units/:id/retire", "post", `/api/units/${u.id}/retire`, {}],
  ];
  return calls;
}

describe("TEST-120 (AC-120): Borrowers and calls without a session cannot manage the catalog", () => {
  it("TEST-120 (a): a Borrower gets 403 FORBIDDEN on each endpoint, only the error, Unchanged", async () => {
    const calls = await setup();
    const borrower = await signIn(app, "borrower1");
    const before = await snapshotCatalogState(prisma);

    for (const [name, method, path, body] of calls) {
      const res = await sendJson(app, method, path, borrower, body);
      expect(res.status, name).toBe(403);
      expect(res.body.error.code, name).toBe("FORBIDDEN");
      expect(Object.keys(res.body), name).toEqual(["error"]);
    }
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });

  it("TEST-120 (b): no cookie and a signed-out session get 401 UNAUTHENTICATED on each endpoint, only the error, Unchanged", async () => {
    const calls = await setup();
    const ended = await signIn(app, "borrower1");
    await signOut(app, ended);
    const before = await snapshotCatalogState(prisma);

    for (const cookie of [undefined, ended]) {
      for (const [name, method, path, body] of calls) {
        const res = await sendJson(app, method, path, cookie, body);
        expect(res.status, name).toBe(401);
        expect(res.body.error.code, name).toBe("UNAUTHENTICATED");
        expect(Object.keys(res.body), name).toEqual(["error"]);
      }
    }
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });
});
