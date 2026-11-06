// Which database and port the E2E run uses (SDS 4.8, 10). Reuses the server's own .env loader
// and the guard of the server tests, so E2E refuses to run unless TEST_DATABASE_URL is set,
// differs from DATABASE_URL and names a database ending in _test. Never prints a URL.
import { loadEnvFile } from "../../server/src/core/config.js";
import { assertSafeTestDatabase } from "../../server/tests/helpers/test-db-guard.js";

// server/.env, as in the server tests. Variables already set in the shell win.
loadEnvFile();

/** The kithub_test connection string, after the guard. */
export const TEST_DATABASE_URL = assertSafeTestDatabase(process.env);

/** Fixed port of the app under test; differs from the dev server (3000) and Vite (5173). */
export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
