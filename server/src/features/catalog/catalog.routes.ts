import { Router, type Request } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import {
  catalogQuery,
  createCategoryBody,
  createItemTypeBody,
  editCategoryBody,
  editItemTypeBody,
  recordIdParams,
  type CreateCategoryBody,
  type CreateItemTypeBody,
  type EditCategoryBody,
  type EditItemTypeBody,
} from "./catalog.schemas.js";
import { catalogService } from "./catalog.service.js";

const pathId = (req: Request) => (req.params as unknown as { id: number }).id;

/**
 * GET /categories (contract F-02 4.1), either role; and catalog management (contract F-09 5.1,
 * 5.2): POST and PATCH of categories and item types, Custodian only.
 */
export function catalogRouter(prisma: PrismaClient): Router {
  const router = Router();
  const service = catalogService(prisma);
  const custodian = [authenticate(prisma), requireRole(Role.CUSTODIAN)];

  router.get("/categories", authenticate(prisma), validate({ query: catalogQuery }), async (_req, res, next) => {
    try {
      res.status(200).json({ items: await service.listCategories() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/categories", ...custodian, validate({ body: createCategoryBody }), async (req, res, next) => {
    try {
      res.status(201).json(await service.createCategory(req.body as CreateCategoryBody));
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/categories/:id",
    ...custodian,
    validate({ params: recordIdParams, body: editCategoryBody }),
    async (req, res, next) => {
      try {
        res.status(200).json(await service.editCategory(pathId(req), req.body as EditCategoryBody));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/item-types", ...custodian, validate({ body: createItemTypeBody }), async (req, res, next) => {
    try {
      res.status(201).json(await service.createItemType(req.body as CreateItemTypeBody));
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/item-types/:id",
    ...custodian,
    validate({ params: recordIdParams, body: editItemTypeBody }),
    async (req, res, next) => {
      try {
        res.status(200).json(await service.editItemType(pathId(req), req.body as EditItemTypeBody));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
