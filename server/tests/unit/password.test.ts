// TEST-07 (AC-07, NFR-03): passwords are stored as salted bcrypt hashes.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/core/config.js";
import { hashPassword, verifyPassword } from "../../src/features/auth/password.js";

const PLAIN = "test-only-password";

describe("TEST-07 (AC-07): salted adaptive password hashes", () => {
  it("TEST-07 (a): cost 12 hashes differ from the plain text and from each other", async () => {
    // Cost passed explicitly, so the test does not depend on BCRYPT_COST=4 in the test environment.
    const first = await hashPassword(PLAIN, 12);
    const second = await hashPassword(PLAIN, 12);

    for (const value of [first, second]) {
      expect(value).not.toBe(PLAIN);
      expect(value).toMatch(/^\$2[ab]\$12\$/);
    }
    expect(first).not.toBe(second);
    expect(await verifyPassword(PLAIN, first)).toBe(true);
    expect(await verifyPassword("wrong-password", first)).toBe(false);
  });

  it("TEST-07 (b): the default cost is 12 when BCRYPT_COST is not set", () => {
    const config = loadConfig({ DATABASE_URL: "postgresql://user@localhost:5432/kithub" });
    expect(config.bcryptCost).toBe(12);
  });
});
