// Tests never touch development or demo data (SDS 4.8). Messages never print a URL,
// because it contains the database password.

export class TestDbGuardError extends Error {
  constructor(message: string) {
    super(`Refusing to run tests: ${message}`);
    this.name = "TestDbGuardError";
  }
}

function databaseName(url: string): string | null {
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Returns TEST_DATABASE_URL after checking that it is set, differs from DATABASE_URL and
 * names a database ending in "_test".
 */
export function assertSafeTestDatabase(env: Record<string, string | undefined>): string {
  const testUrl = env.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw new TestDbGuardError("TEST_DATABASE_URL is not set.");
  if (env.DATABASE_URL && testUrl === env.DATABASE_URL.trim())
    throw new TestDbGuardError("TEST_DATABASE_URL must differ from DATABASE_URL.");
  const name = databaseName(testUrl);
  if (!name) throw new TestDbGuardError("TEST_DATABASE_URL is not a valid PostgreSQL URL.");
  if (!name.endsWith("_test")) throw new TestDbGuardError("TEST_DATABASE_URL must name a database ending in _test.");
  if (env.DATABASE_URL && databaseName(env.DATABASE_URL) === name)
    throw new TestDbGuardError("TEST_DATABASE_URL must name a different database from DATABASE_URL.");
  return testUrl;
}
