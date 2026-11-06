// TEST-31 (AC-11, BR-04): a duplicate open request is refused in the UI with the rule's message
// from contract F-02 (F02-D2), and the database still holds one open request (MT-07).
import { evidence, expect, expectSignedInAs, signIn, test } from "./support/fixtures.js";
import { createJourneyWorld } from "./support/world.js";

const OPEN_STATES = ["PENDING", "APPROVED"] as const; // open request states (SRS section 8)

test("TEST-31: a second request for an item type with an open request is refused with the BR-04 message", async ({
  page,
  db,
}, testInfo) => {
  const { borrower, arduino } = await createJourneyWorld(db);
  const openArduinoRequests = () =>
    db.borrowRequest.count({
      where: { borrowerId: borrower.id, status: { in: [...OPEN_STATES] }, lines: { some: { itemTypeId: arduino.itemType.id } } },
    });

  await signIn(page, "borrower1");
  await expectSignedInAs(page, "Borrower One", "Borrower");
  const requestArduino = page.getByRole("button", { name: "Request Arduino Uno R3" });

  // The first request is accepted: the Borrower now has an open request for Arduino Uno R3.
  await requestArduino.click();
  const submitted = page.getByRole("status").filter({ hasText: "submitted" });
  await expect(submitted).toHaveText(/^Request #\d+ submitted\. See My requests$/);
  const firstId = Number((await submitted.textContent())!.match(/Request #(\d+)/)![1]);
  expect(await openArduinoRequests()).toBe(1);

  // The second is refused (409 DUPLICATE_OPEN_REQUEST), shown as an alert with the API message.
  await expect(requestArduino).toBeEnabled();
  await requestArduino.click();
  await expect(page.getByRole("alert")).toHaveText(
    `You already have an open request for Arduino Uno R3 (Request #${firstId}).`,
  );
  await expect(submitted).toHaveCount(0);
  await evidence(page, testInfo, "TEST-31 duplicate request refused");

  // Backend: still exactly one open request for that item type, and no other request stored.
  expect(await openArduinoRequests()).toBe(1);
  expect(await db.borrowRequest.count()).toBe(1);

  // My requests lists the one request only.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My requests" }).click();
  await expect(page.getByRole("link", { name: /^Request #\d+/ })).toHaveCount(1);
  await expect(page.getByRole("link", { name: new RegExp(`^Request #${firstId}\\b`) })).toContainText("Pending");
});
