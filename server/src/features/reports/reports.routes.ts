import { Router } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import { inventoryReportQuery } from "./reports.schemas.js";
import { reportsService } from "./reports.service.js";

/** GET /reports/inventory (contract F-14 5.1), Custodian only (SDS 7.1). */
export function reportsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const service = reportsService(prisma);

  router.get(
    "/reports/inventory",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ query: inventoryReportQuery }),
    async (_req, res, next) => {
      try {
        res.status(200).json(await service.inventory());
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
