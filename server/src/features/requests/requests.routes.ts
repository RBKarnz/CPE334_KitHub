import { Router } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import {
  createRequestBody,
  listRequestsQuery,
  requestIdParams,
  type CreateRequestBody,
  type ListRequestsQuery,
} from "./requests.schemas.js";
import { requestsService } from "./requests.service.js";

/** POST /requests, GET /requests, GET /requests/:id (contract F-02 4.2 to 4.4). */
export function requestsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const service = requestsService(prisma);

  // 401 → 403 → 400 before the service reads anything (SDS 6.5).
  router.post(
    "/requests",
    authenticate(prisma),
    requireRole(Role.BORROWER),
    validate({ body: createRequestBody }),
    async (req, res, next) => {
      try {
        res.status(201).json(await service.create(req.user!, req.body as CreateRequestBody));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/requests", authenticate(prisma), validate({ query: listRequestsQuery }), async (req, res, next) => {
    try {
      res.status(200).json({ items: await service.list(req.user!, req.query as ListRequestsQuery) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/requests/:id", authenticate(prisma), validate({ params: requestIdParams }), async (req, res, next) => {
    try {
      res.status(200).json(await service.get(req.user!, (req.params as unknown as { id: number }).id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
