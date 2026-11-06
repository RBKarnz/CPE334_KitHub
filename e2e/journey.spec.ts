// TEST-30 (AC-01, AC-09, AC-19, AC-26): the Sprint 1 journey through the built UI, the API and
// kithub_test, ending with a check of what the database stored. Texts are from contracts F-01,
// F-02 and F-03 and match the manual test guide (MT-02, MT-06, MT-11 to MT-13).
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

  // --- Custodian: land on Pending requests and check out a unit (AC-19) ---
  await signIn(page, "custodian1");
  await expect(page).toHaveURL(/\/pending$/);
  await expectSignedInAs(page, "Custodian One", "Custodian");
  await expect(page.getByRole("heading", { name: "Pending requests", level: 1 })).toBeVisible();

  const pendingRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: `#${requestId}`, exact: true }) });
  await expect(pendingRow).toContainText("Borrower One (borrower1)");
  await expect(pendingRow).toContainText("Arduino Uno R3");
  await pendingRow.getByRole("button", { name: `Check out Request #${requestId}` }).click();

  const dialog = page.getByRole("dialog", { name: `Check out Request #${requestId}` });
  await expect(dialog).toContainText("Borrower One (borrower1) · Arduino Uno R3");
  // Only the requested item type's AVAILABLE units: no ESP32 DevKitC unit is offered.
  const unitChoices = dialog.getByRole("radio");
  await expect(unitChoices).toHaveCount(5);
  for (const unit of arduino.units) await expect(dialog.getByLabel(unit.assetTag, { exact: true })).toBeVisible();
  await expect(dialog.getByText(/KH-ESP-/)).toHaveCount(0);

  await dialog.getByLabel("KH-ARD-0001", { exact: true }).check();
  const confirm = dialog.getByRole("button", { name: `Check out KH-ARD-0001 for Request #${requestId}` });
  await expect(confirm).toBeEnabled();
  await evidence(page, testInfo, "TEST-30 4 checkout dialog");
  await confirm.click();

  await expect(dialog).toBeHidden();
  const checkedOut = page.getByRole("status").filter({ hasText: "checked out" });
  await expect(checkedOut).toHaveText(new RegExp(`^Request #${requestId} checked out: KH-ARD-0001, due .+$`));
  const checkoutMessage = await checkedOut.textContent();
  await expect(pendingRow).toHaveCount(0);
  await expect(page.getByText("No pending requests.")).toBeVisible();
  await evidence(page, testInfo, "TEST-30 5 checkout success");

  // The catalog count drops by one (AC-26), and a Custodian has no Request button.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Catalog" }).click();
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
  // Due date = checkout time + the item type's 14-day maximum (D-16).
  expect(loan.dueAt.getTime() - loan.checkedOutAt.getTime()).toBe(14 * DAY_MS);
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
