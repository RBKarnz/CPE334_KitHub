// Direct access to kithub_test for E2E setup and backend checks. The Prisma Client is the
// server's own (server/node_modules), so E2E needs no second copy of Prisma; it is always
// created with the guarded TEST_DATABASE_URL, never with DATABASE_URL.
import { createRequire } from "node:module";
import { TEST_DATABASE_URL } from "./env.js";

const requireFromServer = createRequire(new URL("../../server/package.json", import.meta.url));
const { PrismaClient } = requireFromServer("@prisma/client") as typeof import("../../server/node_modules/@prisma/client/index.js");

export type Db = InstanceType<typeof PrismaClient>;

/** A Prisma Client on kithub_test. The caller disconnects it. */
export function connectTestDb(): Db {
  return new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
}

// Reused from the server tests: TRUNCATE of every table, the factories with the test-only
// password, and the checkout snapshot that defines "nothing changed" (contract F-03 3.6).
export { resetDb } from "../../server/tests/helpers/db.js";
export {
  TEST_PASSWORD,
  createBorrower,
  createCategory,
  createCustodian,
  createItemType,
  createRequest,
  createUnit,
} from "../../server/tests/helpers/factories.js";
export { snapshotCheckoutState } from "../../server/tests/helpers/checkout.js";
