import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, loadSeedConfig } from "../../src/core/config.js";

// Values that must never appear in an error message.
const SECRET_URL = "postgresql://kithub:sentinel-db-secret@localhost:5432/kithub?schema=public";
const SECRET_PASSWORD = "sentinel-password-value";

function errorOf(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error("expected a ConfigError");
}

describe("TEST-28 (NFR-07): settings come from the environment", () => {
  it("TEST-28: rejects a missing DATABASE_URL and names it without printing any value", () => {
    const env = { PORT: "3000", SEED_CUSTODIAN_PASSWORD: SECRET_PASSWORD, TEST_DATABASE_URL: SECRET_URL };
    const err = errorOf(() => loadConfig(env));

    expect(err.message).toContain("DATABASE_URL is required");
    expect(err.message).not.toContain("sentinel");
    expect(err.message).not.toContain("postgresql://");
  });

  it("TEST-28: an empty DATABASE_URL counts as missing", () => {
    expect(errorOf(() => loadConfig({ DATABASE_URL: "  " })).message).toContain("DATABASE_URL is required");
  });

  it("TEST-28: an invalid value is named but not printed", () => {
    const env = {
      DATABASE_URL: "mysql://kithub:sentinel-db-secret@localhost/kithub",
      PORT: "sentinel-port",
      BCRYPT_COST: "99",
    };
    const err = errorOf(() => loadConfig(env));

    expect(err.problems).toEqual(
      expect.arrayContaining(["DATABASE_URL is invalid", "PORT is invalid", "BCRYPT_COST is invalid"]),
    );
    expect(err.message).not.toContain("sentinel");
    expect(err.message).not.toContain("99");
  });

  it("TEST-28: only DATABASE_URL is required; every other setting has the SDS 9.1 default", () => {
    const config = loadConfig({ DATABASE_URL: SECRET_URL });

    expect(config).toEqual({
      nodeEnv: "development",
      port: 3000,
      databaseUrl: SECRET_URL,
      testDatabaseUrl: undefined,
      sessionTtlHours: 8,
      cookieSecure: false,
      bcryptCost: 12,
    });
  });

  it("TEST-28: reads each setting from the environment", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: SECRET_URL,
      SESSION_TTL_HOURS: "4",
      BCRYPT_COST: "10",
    });

    expect(config).toMatchObject({ nodeEnv: "production", port: 8080, sessionTtlHours: 4, bcryptCost: 10 });
    expect(config.cookieSecure).toBe(true); // default in production
    expect(loadConfig({ DATABASE_URL: SECRET_URL, NODE_ENV: "production", COOKIE_SECURE: "false" }).cookieSecure).toBe(
      false,
    );
  });
});

describe("Seed settings (SDS 4.8, 8.1)", () => {
  it("requires SEED_CUSTODIAN_PASSWORD and names it", () => {
    expect(errorOf(() => loadSeedConfig({})).problems).toEqual(["SEED_CUSTODIAN_PASSWORD is required"]);
  });

  it("requires SEED_BORROWER_PASSWORD only when SEED_DEMO_DATA=true", () => {
    expect(loadSeedConfig({ SEED_CUSTODIAN_PASSWORD: SECRET_PASSWORD }).seedDemoData).toBe(false);

    const err = errorOf(() => loadSeedConfig({ SEED_CUSTODIAN_PASSWORD: SECRET_PASSWORD, SEED_DEMO_DATA: "true" }));
    expect(err.problems).toEqual(["SEED_BORROWER_PASSWORD is required"]);
    expect(err.message).not.toContain("sentinel");
  });

  it("rejects a password longer than 72 bytes without printing it", () => {
    const long = "sentinel-" + "é".repeat(32); // 9 + 64 = 73 bytes
    const err = errorOf(() => loadSeedConfig({ SEED_CUSTODIAN_PASSWORD: long }));

    expect(err.problems).toEqual(["SEED_CUSTODIAN_PASSWORD is longer than 72 bytes"]);
    expect(err.message).not.toContain("sentinel");
  });

  it("accepts a password of exactly 72 bytes", () => {
    expect(loadSeedConfig({ SEED_CUSTODIAN_PASSWORD: "a".repeat(72) }).custodianPassword).toHaveLength(72);
  });
});
