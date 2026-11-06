// Access rules for F-02: TEST-14, TEST-15 and TEST-33 (contract F-02 8.2).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn, signOut } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemTypeWithUnits, createRequest } from "../helpers/factories.js";
import { oneLine, postRequest, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();
let arduino: { id: number };
let r3: { id: number };

beforeEach(async () => {
  await resetDb(prisma);
  await createBorrower(prisma, { username: "borrower1" });
  const b2 = await createBorrower(prisma, { username: "borrower2" });
  await createCustodian(prisma, { username: "custodian1" });
  arduino = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3" }, { AVAILABLE: 2 });
  r3 = await createRequest(prisma, { borrowerId: b2.id, itemTypeId: arduino.id });
});

describe("TEST-14 (AC-14): another Borrower's request", () => {
  it("TEST-14: 404 with only the error object and none of the request's fields", async () => {
    const res = await request(app).get(`/api/requests/${r3.id}`).set("Cookie", await signIn(app, "borrower1"));

    expect(res.status).toBe(404);
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe(`Request ${r3.id} does not exist.`);
    expect(JSON.stringify(res.body)).not.toMatch(/borrower2|Arduino|PENDING/);
  });
});

describe("TEST-15 (AC-15): a Custodian cannot create a request", () => {
  it("TEST-15: 403 FORBIDDEN and nothing stored", async () => {
    const before = await snapshotRequestState(prisma);
    const res = await postRequest(app, await signIn(app, "custodian1"), oneLine(arduino.id));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });
});

describe("TEST-33 (AC-33): every F-02 endpoint needs a session", () => {
  const calls = (cookie: string | undefined) => {
    const withCookie = (req: request.Test) => (cookie ? req.set("Cookie", cookie) : req);
    return [
      withCookie(request(app).get("/api/categories")),
      postRequest(app, cookie, oneLine(arduino.id)),
      withCookie(request(app).get("/api/requests")),
      withCookie(request(app).get("/api/requests/1")),
    ];
  };

  it.each([["no cookie"], ["a signed-out session"]])("TEST-33: %s gives 401 on every endpoint", async (which) => {
    let cookie: string | undefined;
    if (which === "a signed-out session") {
      cookie = await signIn(app, "borrower1");
      expect((await signOut(app, cookie)).status).toBe(204);
    }
    const before = await snapshotRequestState(prisma);

    for (const res of await Promise.all(calls(cookie))) {
      expect(res.status).toBe(401);
      expect(Object.keys(res.body)).toEqual(["error"]);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });
});
