import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { NotReadyError } from "./errors.js";

/** Liveness and readiness (SDS 6.7). Neither needs a session or returns private data. */
export function healthRouter(prisma: PrismaClient): Router {
  const router = Router();

  // The process is up. Does not touch the database.
  router.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // The database is reachable.
  router.get("/ready", async (req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ready" });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(
        JSON.stringify({
          time: new Date().toISOString(),
          level: "error",
          requestId: req.requestId,
          path: "/api/ready",
          error: e.name,
          message: e.message,
        }),
      );
      next(new NotReadyError());
    }
  });

  return router;
}
