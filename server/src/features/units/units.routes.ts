import { Router } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import { dueDatePreviewQuery, itemTypeIdParams, listUnitsQuery, type ListUnitsQuery } from "./units.schemas.js";
import { unitsService } from "./units.service.js";

/**
 * GET /item-types/:id/units (contract F-03 5.2) and GET /item-types/:id/due-date-preview (5.5, #71).
 * Custodian only: asset tags and checkout planning are staff data (SDS 7.1).
 */
export function unitsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const service = unitsService(prisma);

  router.get(
    "/item-types/:id/units",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ params: itemTypeIdParams, query: listUnitsQuery }),
    async (req, res, next) => {
      try {
        const { id } = req.params as unknown as { id: number };
        res.status(200).json({ items: await service.listForItemType(id, req.query as ListUnitsQuery) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/item-types/:id/due-date-preview",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ params: itemTypeIdParams, query: dueDatePreviewQuery }),
    async (req, res, next) => {
      try {
        const { id } = req.params as unknown as { id: number };
        res.status(200).json(await service.dueDatePreview(id));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
