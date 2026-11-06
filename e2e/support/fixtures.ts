// The `test` used by every E2E file. Each test starts from empty tables and creates its own
// users, catalog and units, so the tests do not depend on each other's order or data.
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { connectTestDb, resetDb, TEST_PASSWORD, type Db } from "./db.js";

export const test = base.extend<{ freshDb: void }, { db: Db }>({
  db: [
    async ({}, use) => {
      const db = connectTestDb();
      await use(db);
      await db.$disconnect();
    },
    { scope: "worker" },
  ],
  freshDb: [
    async ({ db }, use) => {
      await resetDb(db);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Signs in through the sign-in page (contract F-01 5) with the test-only password. */
export async function signIn(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to KitHub" })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Presses Sign out in the navigation bar and waits for the sign-in page. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to KitHub" })).toBeVisible();
}

/** The navigation bar shows the signed-in user's display name and a role badge (FR-03). */
export async function expectSignedInAs(page: Page, displayName: string, role: "Borrower" | "Custodian") {
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText(displayName, { exact: true })).toBeVisible();
  await expect(nav.getByText(role, { exact: true })).toBeVisible();
}

/**
 * Times as the UI shows them: "6 Nov 2026, 14:30" in Asia/Bangkok (SDS 5.3, client/src/format.ts).
 * Used to compare a stored instant from the database with the text on screen.
 */
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Bangkok",
});
export const formatDateTime = (date: Date) => DATE_TIME.format(date);

/**
 * Attaches a full-page screenshot to the HTML report, as evidence for Deliverable 1 Part F.
 * Report attachments only: nothing is written into the repository.
 */
export async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
