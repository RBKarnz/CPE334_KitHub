// TEST-58 (AC-58), API part: GET /api/item-types/:id/due-date-preview (contract F-03 5.5, v1.3 #71).
// The preview and a checkout at the same server time give the same dueAt; the endpoint is
// Custodian only and writes nothing.
// F-07 (F07-D8): checkout now needs an APPROVED request (FR-17 replaces FR-16), so these tests
// create their requests APPROVED; their rule assertions are unchanged.
import { RequestStatus } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { checkoutBody, createCheckoutWorld, postCheckout, snapshotCheckoutState } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createRequest, createUnit } from "../helpers/factories.js";
import { detailFields } from "../helpers/requests.js";

const app = createTestApp();
const NOW = "2026-11-06T07:30:00.000Z"; // Fri 6 Nov 2026, 14:30 ICT

beforeEach(async () => {
  await resetDb(prisma);
  // Only Date is faked; the sessions use the same faked clock for creation and expiry.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
});

afterEach(() => vi.useRealTimers());

function getPreview(cookie: string | undefined, itemTypeId: number | string, query = "") {
  const req = request(app).get(`/api/item-types/${itemTypeId}/due-date-preview${query ? `?${query}` : ""}`);
  return cookie ? req.set("Cookie", cookie) : req;
}

async function setup() {
  const w = await createCheckoutWorld(prisma);
  const u = await createUnit(prisma, { itemTypeId: w.arduino.id, assetTag: "KH-ARD-0007" });
  const r = await createRequest(prisma, { status: RequestStatus.APPROVED,  borrowerId: w.b1.id, itemTypeId: w.arduino.id });
  return { w, u, r };
}

describe("TEST-58 (AC-58): due-date preview endpoint", () => {
  it("TEST-58 (a): a Custodian gets the due date, and a checkout at the same time stores the same dueAt", async () => {
    const { w, u, r } = await setup();
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotCheckoutState(prisma);

    const res = await getPreview(cookie, w.arduino.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      itemTypeId: w.arduino.id,
      maxLoanDays: 14,
      at: NOW,
      dueAt: "2026-11-20T10:00:00.000Z",
    });
    expect(await snapshotCheckoutState(prisma)).toEqual(before);

    const checkout = await postCheckout(app, cookie, r.id, checkoutBody(r.lines[0].id, u.id));
    expect(checkout.status).toBe(201);
    expect(checkout.body.lines[0].loans[0].dueAt).toBe(res.body.dueAt);
  });

  it("TEST-58 (b): a Borrower gets 403 FORBIDDEN", async () => {
    const { w } = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await getPreview(await signIn(app, "borrower1"), w.arduino.id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });

  it("TEST-58 (c): no session gets 401 UNAUTHENTICATED", async () => {
    const { w } = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await getPreview(undefined, w.arduino.id);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });

  it("TEST-58 (d): an unknown item type gets 404 NOT_FOUND", async () => {
    await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await getPreview(await signIn(app, "custodian1"), 999999);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Item type 999999 does not exist.");
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });

  it("TEST-58 (e): any query field gets 400 VALIDATION_FAILED naming it", async () => {
    const { w } = await setup();
    const before = await snapshotCheckoutState(prisma);

    const res = await getPreview(await signIn(app, "custodian1"), w.arduino.id, "x=1");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res).some((f) => f === "x" || f.endsWith(".x"))).toBe(true);
    expect(await snapshotCheckoutState(prisma)).toEqual(before);
  });
});
