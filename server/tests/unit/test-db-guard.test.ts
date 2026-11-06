import { describe, expect, it } from "vitest";
import { assertSafeTestDatabase } from "../helpers/test-db-guard.js";

const dev = "postgresql://kithub:pw@localhost:5432/kithub?schema=public";
const test = "postgresql://kithub:pw@localhost:5432/kithub_test?schema=public";

describe("test database guard (SDS 4.8)", () => {
  it("accepts a separate *_test database", () => {
    expect(assertSafeTestDatabase({ DATABASE_URL: dev, TEST_DATABASE_URL: test })).toBe(test);
  });

  it("refuses when TEST_DATABASE_URL is not set", () => {
    expect(() => assertSafeTestDatabase({ DATABASE_URL: dev })).toThrow(/TEST_DATABASE_URL is not set/);
  });

  it("refuses when TEST_DATABASE_URL equals DATABASE_URL", () => {
    expect(() => assertSafeTestDatabase({ DATABASE_URL: test, TEST_DATABASE_URL: test })).toThrow(/must differ/);
  });

  it("refuses a database whose name does not end in _test, without printing the URL", () => {
    let message = "";
    try {
      assertSafeTestDatabase({ DATABASE_URL: test, TEST_DATABASE_URL: dev });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/ending in _test/);
    expect(message).not.toContain("pw@");
  });
});
