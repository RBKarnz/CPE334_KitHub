// Test data for the E2E journeys, built with the server test factories. Names and asset tags
// follow the demo catalog (SDS 4.8) so screens read like the manual test guide, but the data is
// created here, on empty tables, never taken from the seed.
import { createBorrower, createCategory, createCustodian, createItemType, createUnit, type Db } from "./db.js";

/** An item type in a category of its own, with AVAILABLE units tagged `<prefix>-0001` upward. */
export async function createStockedItemType(
  db: Db,
  options: { category: string; name: string; prefix: string; units: number; maxLoanDays?: number },
) {
  const maxLoanDays = options.maxLoanDays ?? 14;
  const category = await createCategory(db, { name: options.category, defaultMaxLoanDays: maxLoanDays });
  const itemType = await createItemType(db, { categoryId: category.id, name: options.name, maxLoanDays });
  const units = [];
  for (let i = 1; i <= options.units; i++) {
    units.push(await createUnit(db, { itemTypeId: itemType.id, assetTag: `${options.prefix}-${String(i).padStart(4, "0")}` }));
  }
  return { category, itemType, units };
}

/** Borrower One, Custodian One and two item types: Arduino Uno R3 (5 units) and ESP32 DevKitC (2 units). */
export async function createJourneyWorld(db: Db) {
  const borrower = await createBorrower(db, { username: "borrower1", displayName: "Borrower One" });
  const custodian = await createCustodian(db, { username: "custodian1", displayName: "Custodian One" });
  const arduino = await createStockedItemType(db, {
    category: "Microcontroller boards",
    name: "Arduino Uno R3",
    prefix: "KH-ARD",
    units: 5,
  });
  const esp32 = await createStockedItemType(db, {
    category: "Wireless boards",
    name: "ESP32 DevKitC",
    prefix: "KH-ESP",
    units: 2,
  });
  return { borrower, custodian, arduino, esp32 };
}
