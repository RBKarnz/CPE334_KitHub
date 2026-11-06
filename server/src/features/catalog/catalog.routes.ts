import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { authenticate } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import { catalogQuery } from "./catalog.schemas.js";
import { catalogService } from "./catalog.service.js";

/** GET /categories (contract F-02 4.1). Either role. */
export function catalogRouter(prisma: PrismaClient): Router {
  const router = Router();
  const service = catalogService(prisma);

  router.get("/categories", authenticate(prisma), validate({ query: catalogQuery }), async (_req, res, next) => {
    try {
      res.status(200).json({ items: await service.listCategories() });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
