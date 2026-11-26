// TEST-30 (AC-01, AC-09, AC-19, AC-26): the Sprint 1 journey through the built UI, the API and
// kithub_test, ending with a check of what the database stored. Texts are from contracts F-01,
// F-02 and F-03 and match the manual test guide (MT-02, MT-06, MT-11 to MT-13).
// F-07 (F07-D8): the Custodian now approves the request on its detail page (F-06) before checking
// it out on Ready for checkout; the checkout dialog picks units with checkboxes.
import { evidence, expect, expectSignedInAs, formatDateTime, signIn, signOut, test } from "./support/fixtures.js";
import { createJourneyWorld } from "./support/world.js";

const DAY_MS = 86_400_000;

test("TEST-30: Borrower requests, Custodian checks out, Borrower sees Checked out", async ({ page, db }, testInfo) => {
  const { borrower, arduino } = await createJourneyWorld(db);

  // --- Borrower: sign in, request Arduino Uno R3, see it Pending, sign out (AC-01, AC-09) ---
  await signIn(page, "borrower1");
  await expect(page).toHaveURL(/\/catalog$/);
  await expectSignedInAs(page, "Borrower One", "Borrower");

  const arduinoRow = page.getByRole("listitem").filter({ hasText: "Arduino Uno R3" });
  await expect(arduinoRow).toContainText("5 available");
  await evidence(page, testInfo, "TEST-30 1 catalog as Borrower One");
  await arduinoRow.getByRole("button", { name: "Request Arduino Uno R3" }).click();

  const submitted = page.getByRole("status").filter({ hasText: "submitted" });
  await expect(submitted).toHaveText(/^Request #\d+ submitted\. See My requests$/);
  const requestId = Number((await submitted.textContent())!.match(/Request #(\d+)/)![1]);
  await expect(arduinoRow).toContainText("5 available"); // a request does not reserve a unit in Sprint 1

  await submitted.getByRole("link", { name: "See My requests" }).click();
  await expect(page).toHaveURL(/\/requests$/);
  const myRequest = page.getByRole("link", { name: new RegExp(`^Request #${requestId}\\b`) });
  await expect(myRequest).toContainText("Arduino Uno R3 × 1");
  await expect(myRequest).toContainText("Pending");
  await evidence(page, testInfo, "TEST-30 2 My requests shows Pending");
  await signOut(page);
  await evidence(page, testInfo, "TEST-30 3 signed out");

  // --- Custodian: approve the request (F-06), then check out a unit on Ready for checkout (AC-19) ---
  await signIn(page, "custodian1");
  await expect(page).toHaveURL(/\/pending$/);
  await expectSignedInAs(page, "Custodian One", "Custodian");
  await page.goto(`/requests/${requestId}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: `Approve Request #${requestId}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "approved" })).toHaveText(`Request #${requestId} approved.`);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Ready for checkout" }).click();
  await expect(page).toHaveURL(/\/pending$/);
  await expect(page.getByRole("heading", { name: "Ready for checkout", level: 1 })).toBeVisible();

  const pendingRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: `#${requestId}`, exact: true }) });
  await expect(pendingRow).toContainText("Borrower One (borrower1)");
  await expect(pendingRow).toContainText("Arduino Uno R3");
  await pendingRow.getByRole("button", { name: `Check out Request #${requestId}` }).click();

  const dialog = page.getByRole("dialog", { name: `Check out Request #${requestId}` });
  await expect(dialog).toContainText("Borrower One (borrower1)");
  await expect(dialog).toContainText("Arduino Uno R3 — choose 1 of 5 available");
  // Only the requested item type's AVAILABLE units: no ESP32 DevKitC unit is offered.
  const unitChoices = dialog.getByRole("checkbox");
  await expect(unitChoices).toHaveCount(5);
  for (const unit of arduino.units) await expect(dialog.getByLabel(unit.assetTag, { exact: true })).toBeVisible();
  await expect(dialog.getByText(/KH-ESP-/)).toHaveCount(0);

  await dialog.getByLabel("KH-ARD-0001", { exact: true }).check();
  const confirm = dialog.getByRole("button", { name: `Check out 1 unit for Request #${requestId}` });
  await expect(confirm).toBeEnabled();
  await evidence(page, testInfo, "TEST-30 4 checkout dialog");
  await confirm.click();

  await expect(dialog).toBeHidden();
  const checkedOut = page.getByRole("status").filter({ hasText: "checked out" });
  await expect(checkedOut).toHaveText(new RegExp(`^Request #${requestId} checked out: KH-ARD-0001, due .+$`));
  const checkoutMessage = await checkedOut.textContent();
  await expect(pendingRow).toHaveCount(0);
  await expect(page.getByText("No approved requests.")).toBeVisible();
  await evidence(page, testInfo, "TEST-30 5 checkout success");

  // The catalog count drops by one (AC-26), and a Custodian has no Request button.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Catalog", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(arduinoRow).toContainText("4 available");
  await expect(page.getByRole("button", { name: /^Request / })).toHaveCount(0);
  await signOut(page);

  // --- Borrower again: the request is Checked out with the unit and a 14-day due date (AC-26) ---
  await signIn(page, "borrower1");
  await expectSignedInAs(page, "Borrower One", "Borrower");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My requests" }).click();
  await expect(myRequest).toContainText("Checked out");
  await myRequest.click();
  await expect(page).toHaveURL(new RegExp(`/requests/${requestId}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Request #${requestId} Checked out`);

  // --- Backend: what the database stored (persisted retrieval) ---
  const stored = await db.borrowRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { lines: { include: { loans: { include: { unit: true } } } } },
  });
  expect(stored.borrowerId).toBe(borrower.id);
  expect(stored.status).toBe("CHECKED_OUT");
  expect(stored.lines).toHaveLength(1);
  expect(stored.lines[0].itemTypeId).toBe(arduino.itemType.id);
  expect(stored.lines[0].loans).toHaveLength(1);
  const loan = stored.lines[0].loans[0];
  expect(loan.status).toBe("ACTIVE");
  expect(loan.unit.assetTag).toBe("KH-ARD-0001");
  expect(loan.unit.status).toBe("ON_LOAN");
  // Due date (D-21, #71): 17:00 ICT on Monday to Friday, 14 to 17 days after the ICT checkout date
  // (the real server clock is used, so there is no fixed value). v1.2 expected checkout + 14 × 24 h.
  const ICT_MS = 7 * 3_600_000;
  const dueIct = new Date(loan.dueAt.getTime() + ICT_MS);
  const ictDay = (d: Date) => Math.floor((d.getTime() + ICT_MS) / DAY_MS);
  expect([dueIct.getUTCHours(), dueIct.getUTCMinutes(), dueIct.getUTCSeconds(), dueIct.getUTCMilliseconds()]).toEqual([17, 0, 0, 0]);
  expect([1, 2, 3, 4, 5]).toContain(dueIct.getUTCDay());
  const days = ictDay(loan.dueAt) - ictDay(loan.checkedOutAt);
  expect(days).toBeGreaterThanOrEqual(14);
  expect(days).toBeLessThanOrEqual(17);
  expect(await db.loan.count()).toBe(1);
  expect(await db.unit.count({ where: { itemTypeId: arduino.itemType.id, status: "AVAILABLE" } })).toBe(4);

  // The screens showed the stored values: the Custodian's message and the Borrower's detail.
  expect(checkoutMessage).toBe(`Request #${requestId} checked out: KH-ARD-0001, due ${formatDateTime(loan.dueAt)}`);
  await expect(page.getByText(`Due ${formatDateTime(loan.dueAt)}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Arduino Uno R3 × 1" })).toContainText(
    `Unit KH-ARD-0001 · Checked out ${formatDateTime(loan.checkedOutAt)}`,
  );
  await evidence(page, testInfo, "TEST-30 6 Borrower sees Checked out");
});
