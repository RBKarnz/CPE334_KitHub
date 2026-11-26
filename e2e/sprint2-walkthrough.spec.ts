// Automated walkthrough of the Sprint 2 manual test guide, MT-20 to MT-30 (docs/sprints/sprint-2/
// manual-test-guide.md), in a real browser against the built app and kithub_test. The data is the
// demo seed itself (seed() and seedDemoRequests() of server/prisma/seed-lib.ts, with the test-only
// password), so request numbers and counts are those of the guide's section 2. It checks the
// texts the guide expects and saves a screenshot per scenario (E2E_EVIDENCE_DIR).
import type { Page } from "@playwright/test";
import { seed, seedDemoRequests } from "../server/prisma/seed-lib.js";
import { TEST_PASSWORD } from "./support/db.js";
import { evidence, expect, signIn, signOut, test } from "./support/fixtures.js";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const requestLinks = (page: Page) => page.locator("tbody tr td:first-child a");
const notice = (page: Page) => page.getByRole("status").filter({ hasNotText: "Loading" });

/** Signs in and waits for the navigation bar, so a following page.goto does not cut the sign-in short. */
async function signInAs(page: Page, username: string) {
  await signIn(page, username);
  await expect(nav(page).getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("MT-20 to MT-30: Sprint 2 walkthrough on the demo seed", async ({ page, db }, testInfo) => {
  test.setTimeout(180_000);
  await seed(db, { bcryptCost: 4, seedDemoData: true, custodianPassword: TEST_PASSWORD, borrowerPassword: TEST_PASSWORD });
  expect(await seedDemoRequests(db)).toBe(6);

  await test.step("MT-20: Ready for checkout, All requests, the state filter", async () => {
    await signInAs(page, "custodian1");
    await expect(page).toHaveURL(/\/pending$/);
    await expect(page.getByRole("heading", { name: "Ready for checkout", level: 1 })).toBeVisible();
    await expect(requestLinks(page)).toHaveText(["#2"]);
    await nav(page).getByRole("link", { name: "All requests" }).click();
    await expect(page.getByRole("heading", { name: "All requests", level: 1 })).toBeVisible();
    await expect(requestLinks(page)).toHaveText(["#6", "#5", "#4", "#3", "#2", "#1"]);
    await evidence(page, testInfo, "MT-20 all requests");
    await page.getByLabel("State").selectOption("APPROVED");
    await expect(requestLinks(page)).toHaveText(["#2"]);
    await page.getByLabel("State").selectOption("");
    await expect(requestLinks(page)).toHaveCount(6);
  });

  await test.step("MT-21: a rejected request with its reason and history", async () => {
    await page.goto("/requests/3");
    await expect(page.getByText(/^Rejected by Custodian One, /)).toBeVisible();
    await expect(page.getByText("Reason: All Raspberry Pi units are booked for the IoT workshop this week.").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Request PENDING → REJECTED" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Approve|Reject)$/ })).toHaveCount(0);
    await evidence(page, testInfo, "MT-21 rejected request");
  });

  await test.step("MT-22: approve Request #1", async () => {
    await page.goto("/requests/1");
    await expect(page.getByText("Loan length: 7 days")).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Approve Request #1 for Borrower One?");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await dialog.getByRole("button", { name: "Approve Request #1" }).click();
    await expect(notice(page)).toHaveText("Request #1 approved.");
    await expect(page.getByText(/^Approved by Custodian One, /)).toBeVisible();
    await expect(page.getByRole("cell", { name: "Request PENDING → APPROVED" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await evidence(page, testInfo, "MT-22 approved");
  });

  let rejectedId = 0;
  await test.step("MT-23: reject a new request with a reason; the Borrower sees it without the Custodian", async () => {
    await signOut(page);
    await signInAs(page, "borrower2");
    await page.getByRole("listitem").filter({ hasText: "Digital multimeter" }).getByRole("button", { name: "Request Digital multimeter" }).click();
    // F-04 (F04-D5): Request opens the new request form; Submit request sends it.
    await page.getByRole("button", { name: "Submit request" }).click();
    const submitted = page.getByRole("status").filter({ hasText: "submitted" });
    await expect(submitted).toHaveText(/^Request #\d+ submitted\./);
    rejectedId = Number((await submitted.textContent())!.match(/#(\d+)/)![1]);
    expect(rejectedId).toBe(7);
    await signOut(page);

    await signInAs(page, "custodian1");
    await page.goto(`/requests/${rejectedId}`);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: `Reject Request #${rejectedId}` });
    await dialog.getByLabel("Reason").fill("   ");
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Reason").fill("Only one multimeter left for the lab session.");
    await expect(confirm).toBeEnabled();
    await expect(dialog).toContainText("45/500");
    await confirm.click();
    await expect(notice(page)).toHaveText(`Request #${rejectedId} rejected.`);
    await signOut(page);

    await signInAs(page, "borrower2");
    await page.goto(`/requests/${rejectedId}`);
    await expect(page.getByText(/^Rejected \d/)).toBeVisible();
    await expect(page.getByText("Reason: Only one multimeter left for the lab session.")).toBeVisible();
    await expect(page.getByRole("main").getByText("Custodian One")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Approve|Reject)$/ })).toHaveCount(0);
    await evidence(page, testInfo, "MT-23 borrower sees the reason");
    await signOut(page);
  });

  await test.step("MT-24: multi-unit checkout of Request #1 with the preview", async () => {
    await signInAs(page, "custodian1");
    await expect(requestLinks(page)).toHaveText(["#2", "#1"]);
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "#1", exact: true }) });
    await expect(row).toContainText("Arduino Uno R3 × 2, HC-SR04 ultrasonic sensor × 1");
    await expect(row).toContainText("7 days");
    await row.getByRole("button", { name: "Check out Request #1" }).click();
    const dialog = page.getByRole("dialog", { name: "Check out Request #1" });
    await expect(dialog).toContainText("Arduino Uno R3 — choose 2 of 5 available");
    await expect(dialog).toContainText("HC-SR04 ultrasonic sensor — choose 1 of 6 available");
    await expect(dialog).toContainText(/Due if checked out now: (Mon|Tue|Wed|Thu|Fri) \d+ \w+ 2026, 17:00/);
    const preview = (await dialog.getByText(/^Due if checked out now:/).textContent())!.replace(/^Due if checked out now: \w+ /, "");
    await dialog.getByLabel("KH-ARD-0001", { exact: true }).check();
    await expect(dialog.getByRole("button", { name: /^Check out/ })).toBeDisabled();
    await dialog.getByLabel("KH-ARD-0002", { exact: true }).check();
    await expect(dialog.getByLabel("KH-ARD-0003", { exact: true })).toBeDisabled();
    await dialog.getByLabel("KH-SR04-0001", { exact: true }).check();
    await evidence(page, testInfo, "MT-24 checkout dialog");
    await dialog.getByRole("button", { name: "Check out 3 units for Request #1" }).click();
    await expect(dialog).toBeHidden();
    await expect(notice(page)).toHaveText(`Request #1 checked out: KH-ARD-0001, KH-ARD-0002, KH-SR04-0001, due ${preview}`);
    await expect(requestLinks(page)).toHaveText(["#2"]);
  });

  await test.step("MT-25: cancelled and rejected requests offer no action", async () => {
    for (const id of [4, 3]) {
      await page.goto(`/requests/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`Request #${id}`);
      await expect(page.getByRole("button", { name: /^(Approve|Reject|Return all|Check out)/ })).toHaveCount(0);
    }
  });

  await test.step("MT-26: My loans and Loans", async () => {
    await signOut(page);
    await signInAs(page, "borrower1");
    await nav(page).getByRole("link", { name: "My loans" }).click();
    await expect(page.getByRole("heading", { name: "My loans", level: 1 })).toBeVisible();
    for (const tag of ["KH-ARD-0001", "KH-ARD-0002", "KH-SR04-0001", "KH-DHT-0001", "KH-DHT-0002"])
      await expect(page.getByText(tag, { exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Borrower" })).toHaveCount(0);
    await evidence(page, testInfo, "MT-26 my loans");
    await signOut(page);

    await signInAs(page, "custodian1");
    await nav(page).getByRole("link", { name: "Loans" }).click();
    await expect(page.getByRole("columnheader", { name: "Borrower" })).toBeVisible();
    await page.getByLabel("Show").selectOption("RETURNED");
    await expect(page.getByText("KH-TRK-0001", { exact: true })).toBeVisible();
  });

  await test.step("MT-27: early return of KH-DHT-0001, Good", async () => {
    await page.goto("/requests/5");
    await page.getByRole("button", { name: "Return this unit KH-DHT-0001" }).click();
    const dialog = page.getByRole("dialog", { name: "Return KH-DHT-0001" });
    await expect(dialog.getByRole("radio", { name: "Good" })).toBeChecked();
    await dialog.getByRole("button", { name: "Return KH-DHT-0001" }).click();
    await expect(notice(page)).toHaveText("KH-DHT-0001 returned.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Checked out");
    await expect(page.getByText(/· Returned .* · Good/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Return this unit/ })).toHaveCount(1);
    await evidence(page, testInfo, "MT-27 early return");
  });

  await test.step("MT-28: return all of Request #1 with one damaged unit", async () => {
    await page.goto("/requests/1");
    await page.getByRole("button", { name: "Return all" }).click();
    const dialog = page.getByRole("dialog", { name: "Return Request #1" });
    await expect(dialog.getByRole("radio", { name: "Good" })).toHaveCount(3);
    await dialog.getByRole("radio", { name: "Damaged" }).nth(1).check();
    await dialog.getByRole("button", { name: "Return 3 units" }).click();
    await expect(notice(page)).toHaveText("Request #1 returned: 2 good, 1 damaged (KH-ARD-0002 sent to maintenance).");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Returned");
    await evidence(page, testInfo, "MT-28 return all");
    await nav(page).getByRole("link", { name: "Catalog", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Arduino Uno R3" })).toContainText("4 available");
    await expect(page.getByRole("listitem").filter({ hasText: "HC-SR04 ultrasonic sensor" })).toContainText("6 available");
  });

  await test.step("MT-29: the last early return ends Request #5", async () => {
    await page.goto("/requests/5");
    await page.getByRole("button", { name: "Return this unit KH-DHT-0002" }).click();
    const dialog = page.getByRole("dialog", { name: "Return KH-DHT-0002" });
    await dialog.getByRole("radio", { name: "Damaged" }).check();
    await dialog.getByRole("button", { name: "Return KH-DHT-0002" }).click();
    await expect(notice(page)).toHaveText("KH-DHT-0002 returned. Request #5 returned.");
    await expect(page.getByText(/· Returned .* · Damaged/)).toBeVisible();
  });

  await test.step("MT-30: a Borrower sees no Custodian control", async () => {
    await signOut(page);
    await signInAs(page, "borrower1");
    await page.goto("/pending");
    await expect(page.getByRole("heading", { name: "Forbidden", level: 1 })).toBeVisible();
    for (const id of [1, 5]) {
      await page.goto(`/requests/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`Request #${id}`);
      await expect(page.getByRole("button", { name: /^(Approve|Reject|Return|Check out)/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "History" })).toHaveCount(0);
    }
    await page.goto("/requests");
    await expect(page.getByRole("heading", { name: "My requests", level: 1 })).toBeVisible();
    await expect(page.getByLabel("State")).toHaveCount(0);
    await evidence(page, testInfo, "MT-30 borrower view");
  });
});
