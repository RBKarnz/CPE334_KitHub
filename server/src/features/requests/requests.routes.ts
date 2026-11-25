import { Router } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import {
  approveBody,
  createRequestBody,
  listRequestsQuery,
  rejectBody,
  requestIdParams,
  type CreateRequestBody,
  type ListRequestsQuery,
  type RejectBody,
} from "./requests.schemas.js";
import { requestsService } from "./requests.service.js";

/**
 * POST /requests, GET /requests, GET /requests/:id (contract F-02 4.2 to 4.4) and
 * POST /requests/:id/approve and /reject (contract F-06 5.1, 5.2).
 */
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

  // 415 (whole /api router) → 401 → 403 → 400 path, then body → service: 404 → 409 (contract F-06 3.5).
  router.post(
    "/requests/:id/approve",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ params: requestIdParams, body: approveBody }),
    async (req, res, next) => {
      try {
        const { id } = req.params as unknown as { id: number };
        res.status(200).json(await service.decide(req.user!, id, "approve"));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/requests/:id/reject",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ params: requestIdParams, body: rejectBody }),
    async (req, res, next) => {
      try {
        const { id } = req.params as unknown as { id: number };
        res.status(200).json(await service.decide(req.user!, id, "reject", (req.body as RejectBody).reason));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
