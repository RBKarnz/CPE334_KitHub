// TEST-62 (AC-62): GET /api/item-types/:id, the item type detail for both roles (contract F-04 5.1,
// F04-D6). No unit IDs or asset tags for either role (F02-D7).
import { UnitStatus } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCategory, createCustodian, createItemTypeWithUnits } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function world() {
  await createBorrower(prisma, { username: "borrower1" });
  await createCustodian(prisma, { username: "custodian1" });
  const instruments = await createCategory(prisma, { name: "Instruments" });
  const t = await createItemTypeWithUnits(
    prisma,
    { categoryId: instruments.id, name: "Digital multimeter", description: "Handheld digital multimeter.", maxLoanDays: 3, maxQuantityPerRequest: 1 },
    { [UnitStatus.AVAILABLE]: 2, [UnitStatus.ON_LOAN]: 1, [UnitStatus.MAINTENANCE]: 1, [UnitStatus.RETIRED]: 1 },
  );
  return { instruments, t, b: await signIn(app, "borrower1"), c: await signIn(app, "custodian1") };
}

const get = (path: string, cookie?: string) => {
  const req = request(app).get(path);
  return cookie ? req.set("Cookie", cookie) : req;
};

describe("TEST-62 (AC-62): item type detail", () => {
  it("TEST-62 (a), (b): both roles get the F04-D6 fields, 2 available, the category, and no units", async () => {
    const s = await world();

    const a = await get(`/api/item-types/${s.t.id}`, s.b);
    expect(a.status).toBe(200);
    expect(a.body).toEqual({
      id: s.t.id,
      name: "Digital multimeter",
      description: "Handheld digital multimeter.",
      isKit: false,
      maxLoanDays: 3,
      maxQuantityPerRequest: 1,
      availableCount: 2,
      category: { id: s.instruments.id, name: "Instruments" },
    });
    expect(JSON.stringify(a.body)).not.toMatch(/KH-|assetTag|units|unitId/);

    const b = await get(`/api/item-types/${s.t.id}`, s.c);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it("TEST-62 (c): an unknown item type is 404", async () => {
    const s = await world();
    const res = await get("/api/item-types/999999", s.b);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "NOT_FOUND", message: "Item type 999999 does not exist." });
  });

  it.each([
    ["(d) a non-integer ID", "/api/item-types/abc", "id"],
    ["(e) a query parameter", "/api/item-types/1?x=1", "x"],
  ])("TEST-62 %s is 400 naming it", async (_label, path, field) => {
    const s = await world();
    const res = await get(path.replace("/1?", `/${s.t.id}?`), s.b);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === field || f.endsWith(`.${field}`))).toBe(true);
  });

  it("TEST-62 (f): no session is 401 with only the error", async () => {
    const s = await world();
    const res = await get(`/api/item-types/${s.t.id}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(Object.keys(res.body)).toEqual(["error"]);
  });
});
