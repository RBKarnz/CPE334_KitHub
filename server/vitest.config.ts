import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // API tests share the kithub_test database, so test files run one at a time.
    fileParallelism: false,
    // Refuses to run unless TEST_DATABASE_URL is a separate *_test database,
    // then points Prisma at it (SDS 4.8).
    setupFiles: ["./tests/helpers/setup-env.ts"],
    // Applies pending migrations to the test database once per run.
    globalSetup: ["./tests/helpers/global-setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
