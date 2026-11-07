// Runs once before the E2E tests (SDS 10): checks that the target is kithub_test, applies the
// migrations with `prisma migrate deploy` (the server tests' own global setup) and empties every
// table. Each test then creates the data it needs (SDS 4.8), so nothing depends on the demo seed.
import migrateTestDatabase from "../server/tests/helpers/global-setup.js";
import { connectTestDb, resetDb } from "./support/db.js";

export default async function globalSetup(): Promise<void> {
  migrateTestDatabase();
  const db = connectTestDb();
  try {
    await resetDb(db);
  } finally {
    await db.$disconnect();
  }
}
