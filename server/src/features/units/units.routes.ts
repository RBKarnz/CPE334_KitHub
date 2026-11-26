import { Router } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import {
  addUnitBody,
  dueDatePreviewQuery,
  emptyBody,
  itemTypeIdParams,
  listUnitsQuery,
  unitIdParams,
  type AddUnitBody,
  type DueDatePreviewQuery,
  type ListUnitsQuery,
} from "./units.schemas.js";
import { unitsService } from "./units.service.js";

/**
 * GET /item-types/:id/units (contract F-03 5.2) and GET /item-types/:id/due-date-preview (5.5, #71);
 * add, repair and retire a unit (contract F-09 5.3). Custodian only: asset tags, checkout planning
 * and catalog management are staff tasks (SDS 7.1).
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
        res.status(200).json(await service.dueDatePreview(id, (req.query as DueDatePreviewQuery).days));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/item-types/:id/units",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ params: itemTypeIdParams, body: addUnitBody }),
    async (req, res, next) => {
      try {
        const { id } = req.params as unknown as { id: number };
        res.status(201).json(await service.addUnit(req.user!, id, (req.body as AddUnitBody).assetTag));
      } catch (err) {
        next(err);
      }
    },
  );

  for (const action of ["repair", "retire"] as const) {
    router.post(
      `/units/:id/${action}`,
      authenticate(prisma),
      requireRole(Role.CUSTODIAN),
      validate({ params: unitIdParams, body: emptyBody }),
      async (req, res, next) => {
        try {
          const { id } = req.params as unknown as { id: number };
          res.status(200).json(await service[action](req.user!, id));
        } catch (err) {
          next(err);
        }
      },
    );
  }

  return router;
}
