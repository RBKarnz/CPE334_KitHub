// Runs once before the test files: applies any pending migrations to the test database,
// so a fresh kithub_test (locally or in CI) needs no manual step. migrate deploy only
// applies migrations; it never resets or drops data.
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../../src/core/config.js";
import { assertSafeTestDatabase } from "./test-db-guard.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default function setup(): void {
  process.env.NODE_ENV = "test";
  loadEnvFile();
  const testUrl = assertSafeTestDatabase(process.env);
  try {
    execSync("npx prisma migrate deploy", {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: "pipe",
    });
  } catch (err) {
    const output = String((err as { stdout?: Buffer }).stdout ?? "") + String((err as { stderr?: Buffer }).stderr ?? "");
    // Prisma prints host and database name, never the password; strip any credentials anyway.
    throw new Error(`prisma migrate deploy failed on the test database:\n${output.replace(/\/\/[^@\s]*@/g, "//***@")}`);
  }
}
