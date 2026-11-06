// TEST-41 (AC-41, AC-06): F-03 endpoints reject a missing or ended session with 401 and a
// Borrower with 403, return only the error object, and change nothing (contract F-03 3.8).
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn, signOut } from "../helpers/auth.js";
import { checkoutBody, createCheckoutWorld, getUnits, postCheckout, snapshotCheckoutState } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

async function setup() {
  const w = await createCheckoutWorld(prisma);
  const u = await createUnit(prisma, { itemTypeId: w.arduino.id });
  const r = await createRequest(prisma, { borrowerId: w.b1.id, itemTypeId: w.arduino.id });
  return { itemTypeId: w.arduino.id, u, r, lineId: r.lines[0].id };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const calls: [string, (s: Setup, cookie: string | undefined) => request.Test][] = [
  ["GET /api/requests?status=PENDING", (_s, cookie) => {
    const req = request(app).get("/api/requests?status=PENDING");
    return cookie ? req.set("Cookie", cookie) : req;
  }],
  ["GET /api/item-types/:id/units?status=AVAILABLE", (s, cookie) => getUnits(app, cookie, s.itemTypeId, "status=AVAILABLE")],
  ["POST /api/requests/:id/checkout", (s, cookie) => postCheckout(app, cookie, s.r.id, checkoutBody(s.lineId, s.u.id))],
];

async function expectUnchanged(s: Setup, before: unknown) {
  expect(await snapshotCheckoutState(prisma)).toEqual(before);
  expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: s.r.id } })).status).toBe("PENDING");
  expect((await prisma.unit.findUniqueOrThrow({ where: { id: s.u.id } })).status).toBe("AVAILABLE");
}

describe("TEST-41 (a) (AC-41): no session or an ended session", () => {
  it.each(calls)("TEST-41 (a): %s with no cookie is 401 with only the error object", async (_name, call) => {
    const s = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await call(s, undefined);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(Object.keys(res.body)).toEqual(["error"]);
    await expectUnchanged(s, before);
  });

  it.each(calls)("TEST-41 (a): %s with a signed-out session cookie is 401 with only the error object", async (_name, call) => {
    const s = await setup();
    const cookie = await signIn(app, "custodian1");
    const out = await signOut(app, cookie);
    expect(out.status).toBe(204);
    const before = await snapshotCheckoutState(prisma);

    const res = await call(s, cookie);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(Object.keys(res.body)).toEqual(["error"]);
    await expectUnchanged(s, before);
  });
});

describe("TEST-41 (b) (AC-06): a Borrower cannot list units or check out", () => {
  it.each(calls.slice(1))("TEST-41 (b): %s as a Borrower is 403 with only the error object", async (_name, call) => {
    const s = await setup();
    const cookie = await signIn(app, "borrower1");
    const before = await snapshotCheckoutState(prisma);

    const res = await call(s, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(Object.keys(res.body)).toEqual(["error"]);
    await expectUnchanged(s, before);
  });
});
