// GET /api/requests and GET /api/requests/:id: TEST-13 and TEST-39 (contract F-02 8.2).
import request from "supertest";
import { RequestStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 6, 6, minutes));
let ids: { r1: number; r2: number; r3: number; r4: number };

beforeEach(async () => {
  await resetDb(prisma);
  const b1 = await createBorrower(prisma, { username: "borrower1" });
  const b2 = await createBorrower(prisma, { username: "borrower2" });
  await createCustodian(prisma, { username: "custodian1" });
  const a = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3" }, { AVAILABLE: 2 });
  const e = await createItemTypeWithUnits(prisma, { name: "ESP32 DevKitC" }, { AVAILABLE: 2 });
  const r1 = await createRequest(prisma, { borrowerId: b1.id, itemTypeId: a.id, createdAt: at(0) });
  const r2 = await createRequest(prisma, {
    borrowerId: b1.id,
    itemTypeId: e.id,
    status: RequestStatus.CHECKED_OUT,
    createdAt: at(10),
  });
  const r3 = await createRequest(prisma, { borrowerId: b2.id, itemTypeId: a.id, createdAt: at(20) });
  const r4 = await createRequest(prisma, { borrowerId: b1.id, itemTypeId: e.id, createdAt: at(30) });
  ids = { r1: r1.id, r2: r2.id, r3: r3.id, r4: r4.id };
});

const get = async (path: string, username: string) =>
  request(app).get(path).set("Cookie", await signIn(app, username));
const idsOf = (res: request.Response) => res.body.items.map((r: { id: number }) => r.id);

describe("TEST-13 (AC-13): a Borrower lists and opens their own requests", () => {
  it("TEST-13: the list has only their requests, and each detail matches its list entry", async () => {
    const list = await get("/api/requests", "borrower1");

    expect(list.status).toBe(200);
    expect(idsOf(list).sort()).toEqual([ids.r1, ids.r2, ids.r4].sort());
    for (const entry of list.body.items) {
      expect(entry).toMatchObject({ status: expect.any(String), createdAt: expect.any(String) });
      expect(entry.lines[0]).toMatchObject({ itemType: { id: expect.any(Number), name: expect.any(String) }, quantity: 1 });
      const detail = await get(`/api/requests/${entry.id}`, "borrower1");
      expect(detail.status).toBe(200);
      expect(detail.body).toEqual(entry);
    }
  });
});

describe("TEST-39 (AC-39): list and detail inputs and order", () => {
  it("TEST-39: Borrower lists are newest first and filter by status; a Custodian's list is oldest first", async () => {
    expect(idsOf(await get("/api/requests", "borrower1"))).toEqual([ids.r4, ids.r2, ids.r1]);
    expect(idsOf(await get("/api/requests?status=PENDING", "borrower1"))).toEqual([ids.r4, ids.r1]);
    expect(idsOf(await get("/api/requests?status=PENDING", "custodian1"))).toEqual([ids.r1, ids.r3, ids.r4]);
  });

  it.each([
    ["/api/requests?status=WAITING", "status"],
    ["/api/requests?foo=1", "foo"],
    ["/api/requests/abc", "id"],
  ])("TEST-39: %s is 400 VALIDATION_FAILED naming %s", async (path, field) => {
    const res = await get(path, "borrower1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === field || f.endsWith(`.${field}`))).toBe(true);
  });

  it("TEST-39: a request ID that does not exist is 404 in the same form as another Borrower's request", async () => {
    const missing = await get("/api/requests/999999", "borrower1");
    const foreign = await get(`/api/requests/${ids.r3}`, "borrower1");

    expect(missing.status).toBe(404);
    expect(Object.keys(missing.body)).toEqual(Object.keys(foreign.body));
    expect(Object.keys(missing.body.error).sort()).toEqual(Object.keys(foreign.body.error).sort());
    expect(missing.body.error.code).toBe(foreign.body.error.code);
    expect(missing.body.error.message).toBe("Request 999999 does not exist.");
  });
});
