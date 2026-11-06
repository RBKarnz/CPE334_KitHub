// TEST-53 (SR-04, regression for #38): on narrow screens a Custodian can still reach and press
// Check out, and Sign out is not cut off. Before the #38 fix, from 576 to 764 px the Pending
// requests table was wider than its panel and the panel's clipped corner hid the Action column,
// and from 576 to 636 px Sign out sat past the right edge of the navigation bar.
import type { Locator, Page } from "@playwright/test";
import { createBorrower, createCustodian, createRequest } from "./support/db.js";
import { evidence, expect, signIn, test } from "./support/fixtures.js";
import { createStockedItemType } from "./support/world.js";

// Item types with the demo catalog's names (SDS 4.8), including its longest ones.
const ITEM_TYPES = [
  ["Microcontroller boards", "Arduino Uno R3", "KH-ARD"],
  ["Wireless boards", "ESP32 DevKitC", "KH-ESP"],
  ["Single-board computers", "Raspberry Pi 4 Model B", "KH-RPI"],
  ["Distance sensors", "HC-SR04 ultrasonic sensor", "KH-SR04"],
  ["Climate sensors", "DHT22 temperature and humidity sensor", "KH-DHT"],
  ["Component kits", "Transistor kit (2N2222 ×4)", "KH-TRK"],
  ["Cables and accessories", "USB-A to USB-B cable", "KH-USB"],
  ["Instruments", "Digital multimeter", "KH-DMM"],
] as const;

const HEIGHT = 800;

/** The page itself never scrolls sideways (SDS 5.3 "Visual style"). */
async function expectNoPageHorizontalScroll(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBe(0);
}

/**
 * The element is entirely on screen and nothing clips or covers it: it is fully in the viewport
 * (clipping by its scrolling ancestors counts), and a hit test at its left edge, centre and right
 * edge lands on the element itself, not on a panel corner or anything else.
 */
async function expectFullyVisible(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport({ ratio: 1 });
  const box = (await target.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const hits = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    return [r.left + 3, r.left + r.width / 2, r.right - 3].map((x) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && el.contains(hit);
    });
  });
  expect(hits, "left edge, centre and right edge of the element receive the pointer").toEqual([true, true, true]);
}

/** A plain mouse click at the centre of the button, as a user would click. */
async function mouseClick(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("TEST-53: Check out is reachable at 640 and 760 px and Sign out is visible at 600 px", async ({ page, db }, testInfo) => {
  await createCustodian(db, { username: "custodian1", displayName: "Custodian One" });
  const borrowers = [
    await createBorrower(db, { username: "borrower1", displayName: "Borrower One" }),
    await createBorrower(db, { username: "borrower2", displayName: "Borrower Two" }),
  ];
  const requestIds: number[] = [];
  for (const [i, [category, name, prefix]] of ITEM_TYPES.entries()) {
    const { itemType } = await createStockedItemType(db, { category, name, prefix, units: 1 });
    const request = await createRequest(db, { borrowerId: borrowers[i % 2].id, itemTypeId: itemType.id });
    requestIds.push(request.id);
  }
  expect(requestIds).toHaveLength(8);

  await signIn(page, "custodian1");
  await expect(page).toHaveURL(/\/pending$/);
  const checkOutButtons = page.getByRole("button", { name: /^Check out Request #\d+$/ });
  await expect(checkOutButtons).toHaveCount(8);

  for (const width of [640, 760]) {
    await test.step(`${width} px: no sideways page scroll; first and last Check out open the dialog`, async () => {
      await page.setViewportSize({ width, height: HEIGHT });
      await page.reload();
      await expect(checkOutButtons).toHaveCount(8);
      await expectNoPageHorizontalScroll(page);

      // The list is oldest first (F03-D2), so the first and last rows are the first and last requests.
      const cases = [
        [requestIds[0], checkOutButtons.first()],
        [requestIds[requestIds.length - 1], checkOutButtons.last()],
      ] as const;
      for (const [requestId, button] of cases) {
        await expect(button).toHaveAccessibleName(`Check out Request #${requestId}`);
        await expectFullyVisible(page, button);
        await mouseClick(page, button);
        const dialog = page.getByRole("dialog", { name: `Check out Request #${requestId}` });
        await expect(dialog).toBeVisible();
        if (requestId === requestIds[0]) await evidence(page, testInfo, `TEST-53 ${width} px checkout dialog`);
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toBeHidden();
      }
      await expectNoPageHorizontalScroll(page);
    });
  }

  await test.step("600 px: Sign out is fully visible", async () => {
    await page.setViewportSize({ width: 600, height: HEIGHT });
    await page.reload();
    await expect(checkOutButtons).toHaveCount(8);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoPageHorizontalScroll(page);
    const signOutButton = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sign out" });
    await expectFullyVisible(page, signOutButton);
    await evidence(page, testInfo, "TEST-53 600 px navigation bar");
  });

  // Nothing was checked out: the dialogs were only opened and cancelled.
  expect(await db.loan.count()).toBe(0);
});
