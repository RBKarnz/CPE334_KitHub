// TEST-48 (AC-48): GET /api/item-types/:id/units (contract F-03 5.2, F03-D8).
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { createCheckoutWorld, getUnits } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createUnit } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function setup() {
  const w = await createCheckoutWorld(prisma);
  // Created out of asset-tag order, so the order must come from assetTag, not id.
  for (const [assetTag, status] of [
    ["KH-ARD-0003", "AVAILABLE"],
    ["KH-ARD-0001", "AVAILABLE"],
    ["KH-ARD-0002", "ON_LOAN"],
    ["KH-ARD-0004", "MAINTENANCE"],
  ] as const)
    await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag, status });
  await createUnit(prisma, { itemTypeId: w.esp32.id, assetTag: "KH-ESP-0001" });
  return { itemTypeId: w.arduino.id, cookie: await signIn(app, "custodian1") };
}

describe("TEST-48 (AC-48): units of an item type", () => {
  it("TEST-48 (a): status=AVAILABLE gives only that item type's AVAILABLE units, ordered by asset tag", async () => {
    const s = await setup();

    const res = await getUnits(app, s.cookie, s.itemTypeId, "status=AVAILABLE");

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["items"]);
    expect(res.body.items.map((u: { assetTag: string }) => u.assetTag)).toEqual(["KH-ARD-0001", "KH-ARD-0003"]);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(["assetTag", "id", "status"]);
      expect(item).toEqual({ id: expect.any(Number), assetTag: item.assetTag, status: "AVAILABLE" });
    }
    const ids = await prisma.unit.findMany({ where: { assetTag: { in: ["KH-ARD-0001", "KH-ARD-0003"] } }, orderBy: { assetTag: "asc" } });
    expect(res.body.items.map((u: { id: number }) => u.id)).toEqual(ids.map((u) => u.id));
  });

  it("TEST-48 (b): without status, every unit of the item type in asset-tag order", async () => {
    const s = await setup();

    const res = await getUnits(app, s.cookie, s.itemTypeId);

    expect(res.status).toBe(200);
    expect(res.body.items.map((u: { assetTag: string; status: string }) => [u.assetTag, u.status])).toEqual([
      ["KH-ARD-0001", "AVAILABLE"],
      ["KH-ARD-0002", "ON_LOAN"],
      ["KH-ARD-0003", "AVAILABLE"],
      ["KH-ARD-0004", "MAINTENANCE"],
    ]);
  });

  it("TEST-48 (c): an unknown item type is 404 NOT_FOUND", async () => {
    const s = await setup();

    const res = await getUnits(app, s.cookie, 999999, "status=AVAILABLE");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Item type 999999 does not exist.");
    expect(Object.keys(res.body)).toEqual(["error"]);
  });

  it.each([
    ["(d) status=BROKEN", "status", "status=BROKEN", undefined],
    ["(e) unknown query field colour=red", "colour", "colour=red", undefined],
    ["(f) item type id 'abc'", "id", "status=AVAILABLE", "abc"],
  ])("TEST-48 %s is 400 VALIDATION_FAILED naming %s", async (_name, field, query, idOverride) => {
    const s = await setup();

    const res = await getUnits(app, s.cookie, idOverride ?? s.itemTypeId, query);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === field || f.endsWith(`.${field}`))).toBe(true);
  });
});
