// Vitest setup file: runs before every test file is imported.
import { loadEnvFile } from "../../src/core/config.js";
import { assertSafeTestDatabase } from "./test-db-guard.js";

process.env.NODE_ENV = "test";
loadEnvFile();

const testUrl = assertSafeTestDatabase(process.env);
// Every Prisma Client created by the app or the tests now uses the test database.
process.env.DATABASE_URL = testUrl;
