// Seed runner: npm run prisma:seed (or npx prisma db seed). See seed-lib.ts and SDS 4.8.
// Stops with an error naming any missing password variable; never prints a password.
import { PrismaClient } from "@prisma/client";
import { ConfigError, loadEnvFile, loadSeedConfig, type SeedConfig } from "../src/core/config.js";
import { seed } from "./seed-lib.js";

async function main(): Promise<void> {
  loadEnvFile();
  let config: SeedConfig;
  try {
    config = loadSeedConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Seed stopped. ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const prisma = new PrismaClient();
  try {
    const result = await seed(prisma, config);
    console.log(
      `Seed complete. Created ${result.categories} categories, ${result.itemTypes} item types, ` +
        `${result.units} units and ${result.users} accounts; existing records were left unchanged. ` +
        `Demo Borrower accounts: ${config.seedDemoData ? "included" : "skipped (SEED_DEMO_DATA is not true)"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`Seed failed: ${e.message}`);
  process.exit(1);
});
