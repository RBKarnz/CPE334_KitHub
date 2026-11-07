import type { Router } from "express";
import { createApp, type AppConfigForApp } from "../../src/app.js";
import { prisma } from "../../src/core/prisma.js";
import type { PrismaClient } from "@prisma/client";

/** Settings of the test app: the SDS 9.1 defaults, with the lowest bcrypt cost for speed. */
export const TEST_APP_CONFIG: AppConfigForApp = {
  nodeEnv: "test",
  sessionTtlHours: 8,
  cookieSecure: false,
  bcryptCost: 4,
};

/**
 * The app as the API tests use it: test settings and the test database. `mountTestRoutes`
 * adds routes that exist only in the test app, such as the role-check route of TEST-06.
 */
export function createTestApp(
  client: PrismaClient = prisma,
  options: { mountTestRoutes?: (api: Router) => void } = {},
) {
  return createApp({ config: TEST_APP_CONFIG, prisma: client, mountTestRoutes: options.mountTestRoutes });
}

export { prisma };
