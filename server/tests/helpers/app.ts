import { createApp } from "../../src/app.js";
import { prisma } from "../../src/core/prisma.js";
import type { PrismaClient } from "@prisma/client";

/** The app as the API tests use it: test settings and the test database. */
export function createTestApp(client: PrismaClient = prisma) {
  return createApp({ config: { nodeEnv: "test" }, prisma: client });
}

export { prisma };
