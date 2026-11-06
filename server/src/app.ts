import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./core/config.js";
import { healthRouter } from "./core/health.routes.js";
import { apiNotFound, errorHandler } from "./core/middleware/error-handler.js";
import { noStore, requestId, requestLogger } from "./core/middleware/request-context.js";
import { requireJson } from "./core/middleware/require-json.js";

export interface AppDeps {
  config: Pick<AppConfig, "nodeEnv">;
  prisma: PrismaClient;
  /** Folder of the built UI. Defaults to client/dist next to server/ (DD-01). */
  clientDistDir?: string;
}

const DEFAULT_CLIENT_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "client",
  "dist",
);

export function createApp({ config, prisma, clientDistDir = DEFAULT_CLIENT_DIST }: AppDeps): Express {
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
  // Feature routers (auth, catalog, requests, ...) are mounted here by their features.

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
