// TEST-08 (AC-08): catalog with available counts (contract F-02 4.1).
import request from "supertest";
import { UnitStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCategory, createCustodian, createItemTypeWithUnits } from "../helpers/factories.js";

beforeEach(async () => {
  await resetDb(prisma);
  await createBorrower(prisma, { username: "borrower1" });
  await createCustodian(prisma, { username: "custodian1" });
});

describe("TEST-08 (AC-08): GET /api/categories", () => {
  it("TEST-08: both roles get categories and item types by name with AVAILABLE counts and no unit data", async () => {
    const boards = await createCategory(prisma, { name: "Microcontroller boards" });
    const instruments = await createCategory(prisma, { name: "Instruments" });
    await createCategory(prisma, { name: "Zero items" });
    await createItemTypeWithUnits(
      prisma,
      { categoryId: boards.id, name: "Arduino Uno R3", description: "Board", isKit: false },
      { AVAILABLE: 2, ON_LOAN: 1, MAINTENANCE: 1, RETIRED: 1 },
    );
    await createItemTypeWithUnits(prisma, { categoryId: boards.id, name: "ESP32 DevKitC" }, { AVAILABLE: 1 });
    await createItemTypeWithUnits(prisma, { categoryId: instruments.id, name: "Oscilloscope" }, {
      [UnitStatus.MAINTENANCE]: 1,
    });

    const app = createTestApp();
    const asBorrower = await request(app).get("/api/categories").set("Cookie", await signIn(app, "borrower1"));
    const asCustodian = await request(app).get("/api/categories").set("Cookie", await signIn(app, "custodian1"));

    expect(asBorrower.status).toBe(200);
    expect(asCustodian.status).toBe(200);
    expect(asCustodian.body).toEqual(asBorrower.body);

    const items = asBorrower.body.items;
    expect(items.map((c: { name: string }) => c.name)).toEqual(["Instruments", "Microcontroller boards", "Zero items"]);
    expect(items[2].itemTypes).toEqual([]);
    expect(items[1].itemTypes.map((t: { name: string }) => t.name)).toEqual(["Arduino Uno R3", "ESP32 DevKitC"]);
    expect(items[1].itemTypes[0]).toEqual({
      id: expect.any(Number),
      name: "Arduino Uno R3",
      description: "Board",
      isKit: false,
      maxLoanDays: 14,
      maxQuantityPerRequest: 2,
      availableCount: 2,
    });
    expect(items[0].itemTypes[0]).toMatchObject({ name: "Oscilloscope", availableCount: 0 });
    expect(Object.keys(items[0]).sort()).toEqual(["description", "id", "itemTypes", "name"]);

    // F02-D7: no unit IDs or asset tags for either role.
    const text = JSON.stringify(asBorrower.body);
    expect(text).not.toMatch(/KH-|assetTag|units|unitId/);
  });

  it("TEST-08: any query parameter is rejected with 400 naming it", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/categories?foo=1").set("Cookie", await signIn(app, "borrower1"));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.map((d: { field: string }) => d.field).join(" ")).toMatch(/foo/);
  });
});
