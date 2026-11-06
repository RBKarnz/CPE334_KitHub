import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./core/config.js";
import { healthRouter } from "./core/health.routes.js";
import { apiNotFound, errorHandler } from "./core/middleware/error-handler.js";
import { noStore, requestId, requestLogger } from "./core/middleware/request-context.js";
import { requireJson } from "./core/middleware/require-json.js";
import { authRouter } from "./features/auth/auth.routes.js";
import { catalogRouter } from "./features/catalog/catalog.routes.js";
import { requestsRouter } from "./features/requests/requests.routes.js";

export type AppConfigForApp = Pick<AppConfig, "nodeEnv" | "sessionTtlHours" | "cookieSecure" | "bcryptCost">;

export interface AppDeps {
  config: AppConfigForApp;
  prisma: PrismaClient;
  /** Folder of the built UI. Defaults to client/dist next to server/ (DD-01). */
  clientDistDir?: string;
  /** Tests only: adds routes that exist only in the test app, before the not-found handler. */
  mountTestRoutes?: (api: Router) => void;
}

const DEFAULT_CLIENT_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "client",
  "dist",
);

export function createApp({ config, prisma, clientDistDir = DEFAULT_CLIENT_DIST, mountTestRoutes }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  // Cloud Run puts one proxy in front of the container.
  app.set("trust proxy", 1);

  // --- API (SDS 6) --------------------------------------------------------
  const api = express.Router();
  api.use(requestId, noStore, requestLogger(config.nodeEnv !== "test"));
  api.use(requireJson);
  api.use(express.json({ limit: "100kb" }));

  api.use(healthRouter(prisma));
  // Feature routers. Each applies authenticate and requireRole to its own routes (SDS 7.2).
  api.use(authRouter(prisma, config));
  api.use(catalogRouter(prisma));
  api.use(requestsRouter(prisma));
  // Loans and units are mounted here by F-03.
  mountTestRoutes?.(api);

  api.use(apiNotFound);
  api.use(errorHandler(true));
  app.use("/api", api);

  // --- Built UI, same origin as the API (DD-01) ---------------------------
  const indexHtml = path.join(clientDistDir, "index.html");
  if (config.nodeEnv === "production" && existsSync(indexHtml)) {
    app.use(express.static(clientDistDir, { index: false }));
    // Client-side routes get index.html; /api never reaches this point.
    app.get("*", (_req, res) => res.sendFile(indexHtml));
  }

  return app;
}
