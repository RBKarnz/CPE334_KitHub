import type { PrismaClient } from "@prisma/client";

// Every table, children first. TRUNCATE does not fire the history row trigger (SDS 4.6).
const TABLES = [
  "history_entries",
  "loans",
  "request_lines",
  "borrow_requests",
  "units",
  "item_types",
  "categories",
  "sessions",
  "users",
];

/** Empties every table of the test database and restarts the ID sequences. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
