// Reads every setting from environment variables once at start-up (SDS 9.1, NFR-07).
// Errors name the variable but never print its value.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

export type NodeEnv = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  testDatabaseUrl: string | undefined;
  sessionTtlHours: number;
  cookieSecure: boolean;
  bcryptCost: number;
}

export interface SeedConfig {
  bcryptCost: number;
  seedDemoData: boolean;
  custodianPassword: string;
  borrowerPassword: string | undefined;
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration: ${problems.join("; ")}`);
    this.name = "ConfigError";
  }
}

// server/.env, from both src/core/ (tsx) and dist/core/ (built).
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Loads server/.env in development and tests only. Never overrides variables already set. */
export function loadEnvFile(env: Env = process.env): void {
  if (env.NODE_ENV === "production") return;
  dotenv.config({ path: path.join(SERVER_ROOT, ".env") });
}

// An empty value counts as missing.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const required = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema);

const intInRange = (min: number, max: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));
const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");
const postgresUrl = z.string().regex(/^postgres(ql)?:\/\/\S+$/);

const serverSchema = z.object({
  NODE_ENV: optional(z.enum(["development", "test", "production"])),
  PORT: optional(intInRange(1, 65535)),
  DATABASE_URL: required(postgresUrl),
  TEST_DATABASE_URL: optional(postgresUrl),
  SESSION_TTL_HOURS: optional(intInRange(1, 720)),
  COOKIE_SECURE: optional(booleanString),
  // bcrypt accepts cost 4 to 31; tests may use a low cost for speed (SDS 9.1).
  BCRYPT_COST: optional(intInRange(4, 31)),
});

const seedSchema = z.object({
  BCRYPT_COST: optional(intInRange(4, 31)),
  SEED_DEMO_DATA: optional(booleanString),
  SEED_CUSTODIAN_PASSWORD: optional(z.string()),
  SEED_BORROWER_PASSWORD: optional(z.string()),
});

// bcrypt reads only the first 72 bytes of a password (SDS 8.1).
const BCRYPT_MAX_BYTES = 72;

function describeIssues(error: z.ZodError, env: Env): string[] {
  const names = new Set(error.issues.map((issue) => String(issue.path[0])));
  // Only the variable name and whether it is missing or invalid; never the value.
  return [...names].map((name) =>
    blankToUndefined(env[name]) === undefined ? `${name} is required` : `${name} is invalid`,
  );
}

/** Validates the server settings in SDS 9.1. Throws ConfigError naming each bad variable. */
export function loadConfig(env: Env = process.env): AppConfig {
  const parsed = serverSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(describeIssues(parsed.error, env));
  const v = parsed.data;
  const nodeEnv = v.NODE_ENV ?? "development";
  return {
    nodeEnv,
    port: v.PORT ?? 3000,
    databaseUrl: v.DATABASE_URL,
    testDatabaseUrl: v.TEST_DATABASE_URL,
    sessionTtlHours: v.SESSION_TTL_HOURS ?? 8,
    cookieSecure: v.COOKIE_SECURE ?? nodeEnv === "production",
    bcryptCost: v.BCRYPT_COST ?? 12,
  };
}

/** Validates the seed settings in SDS 9.1. Passwords are required only when the seed needs them. */
export function loadSeedConfig(env: Env = process.env): SeedConfig {
  const parsed = seedSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(describeIssues(parsed.error, env));
  const v = parsed.data;
  const seedDemoData = v.SEED_DEMO_DATA ?? false;

  const problems: string[] = [];
  const checkPassword = (name: string, value: string | undefined) => {
    if (value === undefined) problems.push(`${name} is required`);
    else if (Buffer.byteLength(value, "utf8") > BCRYPT_MAX_BYTES)
      problems.push(`${name} is longer than ${BCRYPT_MAX_BYTES} bytes`);
  };
  checkPassword("SEED_CUSTODIAN_PASSWORD", v.SEED_CUSTODIAN_PASSWORD);
  if (seedDemoData) checkPassword("SEED_BORROWER_PASSWORD", v.SEED_BORROWER_PASSWORD);
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    bcryptCost: v.BCRYPT_COST ?? 12,
    seedDemoData,
    custodianPassword: v.SEED_CUSTODIAN_PASSWORD as string,
    borrowerPassword: seedDemoData ? v.SEED_BORROWER_PASSWORD : undefined,
  };
}
