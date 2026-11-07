// TEST-32 (AC-06, NFR-02): a Borrower cannot reach a Custodian operation. The UI shows the
// Forbidden page, and the API refuses the same signed-in Borrower with 403 FORBIDDEN in the
// JSON error shape (SDS 6.5) and changes nothing (contract F-03 3.8; MT-09).
import { createRequest, snapshotCheckoutState } from "./support/db.js";
import { evidence, expect, expectSignedInAs, signIn, test } from "./support/fixtures.js";
import { createJourneyWorld } from "./support/world.js";

test("TEST-32: a Borrower sees the Forbidden page at /pending and the API refuses checkout with 403", async ({
  page,
  db,
}, testInfo) => {
  const { borrower, arduino } = await createJourneyWorld(db);
  // A real PENDING request of this Borrower and an AVAILABLE unit, so a checkout would change data.
  const pending = await createRequest(db, { borrowerId: borrower.id, itemTypeId: arduino.itemType.id });
  const unit = arduino.units[0];
  const before = await snapshotCheckoutState(db);

  await signIn(page, "borrower1");
  await expectSignedInAs(page, "Borrower One", "Borrower");

  // UI: the Custodian page is refused.
  await page.goto("/pending");
  await expect(page.getByRole("heading", { name: "Forbidden", level: 1 })).toBeVisible();
  await expect(page.getByText("You do not have permission to do this.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending requests" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Check out/ })).toHaveCount(0);
  await evidence(page, testInfo, "TEST-32 Forbidden page");

  // API: the same browser context, so the call carries the Borrower's session cookie.
  const expectForbidden = async (response: Awaited<ReturnType<typeof page.request.get>>) => {
    expect(response.status()).toBe(403);
    expect(response.headers()["content-type"]).toMatch(/^application\/json/);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["error"]); // only the error object, no request, unit or loan data
    expect(body.error).toEqual({
      code: "FORBIDDEN",
      message: "You do not have permission to do this.",
      requestId: expect.any(String),
    });
  };

  // The session is valid for Borrower operations, so the 403 is about the role, not a missing cookie.
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user).toMatchObject({ username: "borrower1", role: "BORROWER" });

  await expectForbidden(
    await page.request.post(`/api/requests/${pending.id}/checkout`, {
      data: { units: [{ lineId: pending.lines[0].id, unitId: unit.id }] },
    }),
  );
  await expectForbidden(await page.request.get(`/api/item-types/${arduino.itemType.id}/units?status=AVAILABLE`));

  // Backend: nothing changed. No loan, no history entry, the request PENDING, the unit AVAILABLE.
  expect(await snapshotCheckoutState(db)).toEqual(before);
  expect((await db.borrowRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
  expect((await db.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("AVAILABLE");
  expect(await db.loan.count()).toBe(0);
});
