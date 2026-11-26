// F-09 categories and item types (contract F-09 sections 3 to 5): TEST-110 to TEST-114. Every
// rejection asserts Unchanged (snapshotCatalogState: categories, item types, units, history count).
import { RequestStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import {
  detailFields,
  listCategories,
  listedItemType,
  patchCategory,
  patchItemType,
  postCategory,
  postItemType,
  snapshotCatalogState,
} from "../helpers/catalog.js";
import { resetDb } from "../helpers/db.js";
import {
  createBorrower,
  createCategory,
  createCustodian,
  createItemType,
  createItemTypeWithUnits,
  createRequest,
} from "../helpers/factories.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function people() {
  await createCustodian(prisma, { username: "custodian1" });
  await createBorrower(prisma, { username: "borrower1" });
  return { c: await signIn(app, "custodian1"), b: await signIn(app, "borrower1") };
}

const ITEM_TYPE_KEYS = [
  "availableCount",
  "category",
  "description",
  "id",
  "isKit",
  "maxLoanDays",
  "maxQuantityPerRequest",
  "name",
];

describe("TEST-110 (AC-110): create a category", () => {
  it("TEST-110: the trimmed name, a null description and the defaults are stored; no history; listed with no item types", async () => {
    const s = await people();
    const before = await snapshotCatalogState(prisma);

    const res = await postCategory(app, s.c, { name: "  Robotics ", description: "", defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), name: "Robotics", description: null, defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });
    const after = await snapshotCatalogState(prisma);
    expect(after.categories).toHaveLength(before.categories.length + 1);
    expect(after.history).toBe(before.history);

    const robotics = (await listCategories(app, s.b)).find((c) => c.name === "Robotics");
    expect(robotics).toMatchObject({ id: res.body.id, itemTypes: [], defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });
  });
});

describe("TEST-111 (AC-111): edit a category", () => {
  it("TEST-111: only the sent fields change; new defaults do not change existing item types", async () => {
    const s = await people();
    const k = await createCategory(prisma, { name: "Microcontroller boards", defaultMaxLoanDays: 14, defaultMaxQuantity: 2 });
    const t = await createItemType(prisma, { categoryId: k.id });

    const a = await patchCategory(app, s.c, k.id, { defaultMaxLoanDays: 7 });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ id: k.id, name: "Microcontroller boards", description: null, defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });
    expect((await prisma.itemType.findUniqueOrThrow({ where: { id: t.id } })).maxLoanDays).toBe(14);

    const b = await patchCategory(app, s.c, k.id, { name: "Boards", description: "Dev boards" });
    expect(b.status).toBe(200);
    expect(b.body).toEqual({ id: k.id, name: "Boards", description: "Dev boards", defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });
  });
});

describe("TEST-112 (AC-112): invalid category and item type bodies, names taken, unknown IDs", () => {
  async function world() {
    const s = await people();
    const instruments = await createCategory(prisma, { name: "Instruments" });
    const k = await createCategory(prisma, { name: "Microcontroller boards" });
    const arduino = await createItemType(prisma, { categoryId: k.id, name: "Arduino Uno R3" });
    return { ...s, instruments, k, arduino };
  }
  const valid = { name: "Robotics", defaultMaxLoanDays: 7, defaultMaxQuantity: 2 };

  it.each([
    ["(a) a blank name", { ...valid, name: "   " }, "name"],
    ["(b) a 101-character name", { ...valid, name: "x".repeat(101) }, "name"],
    ["(c) defaultMaxLoanDays 0", { ...valid, defaultMaxLoanDays: 0 }, "defaultMaxLoanDays"],
    ["(c) defaultMaxLoanDays 366", { ...valid, defaultMaxLoanDays: 366 }, "defaultMaxLoanDays"],
    ["(d) defaultMaxQuantity 11", { ...valid, defaultMaxQuantity: 11 }, "defaultMaxQuantity"],
    ["(e) an unknown field id", { ...valid, id: 5 }, "id"],
  ])("TEST-112 %s on create is 400 naming the field; Unchanged", async (_label, body, field) => {
    const s = await world();
    const before = await snapshotCatalogState(prisma);

    const res = await postCategory(app, s.c, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res)).toContain(field);
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });

  it("TEST-112 (f): an edit with no field is 400 naming body; Unchanged", async () => {
    const s = await world();
    const before = await snapshotCatalogState(prisma);

    const res = await patchCategory(app, s.c, s.k.id, {});

    expect(res.status).toBe(400);
    expect(detailFields(res)).toEqual(["body"]);
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });

  it("TEST-112 (g), (h): a name used in another letter case is 409 NAME_TAKEN with the F09-D2 message; Unchanged", async () => {
    const s = await world();
    const before = await snapshotCatalogState(prisma);

    const g = await postCategory(app, s.c, { ...valid, name: "instruments" });
    expect(g.status).toBe(409);
    expect(g.body.error).toMatchObject({ code: "NAME_TAKEN", message: "A category named Instruments already exists." });

    const h = await postItemType(app, s.c, { categoryId: s.k.id, name: "ARDUINO UNO R3" });
    expect(h.status).toBe(409);
    expect(h.body.error).toMatchObject({ code: "NAME_TAKEN", message: "An item type named Arduino Uno R3 already exists." });

    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });

  it("TEST-112 (i), (j): an unknown category or item type ID is 404; Unchanged", async () => {
    const s = await world();
    const before = await snapshotCatalogState(prisma);

    const i = await patchCategory(app, s.c, 999999, { defaultMaxQuantity: 3 });
    expect(i.status).toBe(404);
    expect(i.body.error).toMatchObject({ code: "NOT_FOUND", message: "Category 999999 does not exist." });

    const j = await patchItemType(app, s.c, 999999, { maxQuantityPerRequest: 3 });
    expect(j.status).toBe(404);
    expect(j.body.error).toMatchObject({ code: "NOT_FOUND", message: "Item type 999999 does not exist." });

    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });

  it("TEST-112 (k), (l): a record's own name, also in another letter case, does not collide with itself", async () => {
    const s = await world();

    const k = await patchCategory(app, s.c, s.instruments.id, { name: "INSTRUMENTS" });
    expect(k.status).toBe(200);
    expect(k.body.name).toBe("INSTRUMENTS");
    expect((await prisma.category.findUniqueOrThrow({ where: { id: s.instruments.id } })).name).toBe("INSTRUMENTS");

    const l = await patchItemType(app, s.c, s.arduino.id, { name: "Arduino Uno R3" });
    expect(l.status).toBe(200);
    expect(l.body.name).toBe("Arduino Uno R3");
  });
});

describe("TEST-113 (AC-113): create an item type", () => {
  it("TEST-113: limits left out come from the category; sent values are stored; listed with 0 available; unknown category 404", async () => {
    const s = await people();
    const k = await createCategory(prisma, { name: "Robotics", defaultMaxLoanDays: 7, defaultMaxQuantity: 2 });

    const a = await postItemType(app, s.c, { categoryId: k.id, name: "Servo motor SG90" });
    expect(a.status).toBe(201);
    expect(Object.keys(a.body).sort()).toEqual(ITEM_TYPE_KEYS);
    expect(a.body).toEqual({
      id: expect.any(Number),
      name: "Servo motor SG90",
      description: "",
      isKit: false,
      maxLoanDays: 7,
      maxQuantityPerRequest: 2,
      availableCount: 0,
      category: { id: k.id, name: "Robotics" },
    });

    const b = await postItemType(app, s.c, {
      categoryId: k.id,
      name: "Servo set",
      description: "Set of 4",
      isKit: true,
      maxLoanDays: 3,
      maxQuantityPerRequest: 1,
    });
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ description: "Set of 4", isKit: true, maxLoanDays: 3, maxQuantityPerRequest: 1, availableCount: 0 });

    const robotics = (await listCategories(app, s.b)).find((c) => c.id === k.id)!;
    expect(robotics.itemTypes.find((t) => t.id === a.body.id)).toMatchObject({
      name: "Servo motor SG90",
      availableCount: 0,
      maxLoanDays: 7,
      maxQuantityPerRequest: 2,
    });

    const before = await snapshotCatalogState(prisma);
    const d = await postItemType(app, s.c, { categoryId: 999999, name: "Ghost" });
    expect(d.status).toBe(404);
    expect(d.body.error.code).toBe("NOT_FOUND");
    expect(detailFields(d)).toEqual(["categoryId"]);
    expect(await snapshotCatalogState(prisma)).toEqual(before);
  });
});

describe("TEST-114 (AC-114): edit an item type", () => {
  it("TEST-114: new limits are stored and listed; open requests keep their lines; a move keeps the limits", async () => {
    const s = await people();
    const borrower = await prisma.user.findUniqueOrThrow({ where: { username: "borrower1" } });
    const t = await createItemTypeWithUnits(prisma, { maxLoanDays: 14, maxQuantityPerRequest: 2 }, { AVAILABLE: 5 });
    const r = await createRequest(prisma, { borrowerId: borrower.id, itemTypeId: t.id, quantity: 2 });
    const other = await createCategory(prisma, { name: "Other" });

    const a = await patchItemType(app, s.c, t.id, { maxQuantityPerRequest: 1, maxLoanDays: 7, description: "New", isKit: true });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ id: t.id, maxQuantityPerRequest: 1, maxLoanDays: 7, description: "New", isKit: true, availableCount: 5 });

    expect(await prisma.itemType.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ maxQuantityPerRequest: 1, maxLoanDays: 7 });
    expect(await listedItemType(app, s.c, t.id)).toMatchObject({ maxQuantityPerRequest: 1, maxLoanDays: 7 });

    const stored = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: r.id }, include: { lines: true } });
    expect(stored.status).toBe(RequestStatus.PENDING);
    expect(stored.lines.map((l) => ({ itemTypeId: l.itemTypeId, quantity: l.quantity }))).toEqual([{ itemTypeId: t.id, quantity: 2 }]);

    const d = await patchItemType(app, s.c, t.id, { categoryId: other.id });
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ category: { id: other.id, name: "Other" }, maxLoanDays: 7, maxQuantityPerRequest: 1 });
  });
});
