import { Router } from "express";
import { Role, type PrismaClient } from "@prisma/client";
import { authenticate, requireRole } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import { requestIdParams } from "../requests/requests.schemas.js";
import { checkoutBody, listLoansQuery, type CheckoutBody, type ListLoansQuery } from "./loans.schemas.js";
import { loansService } from "./loans.service.js";

/** POST /requests/:id/checkout (contract F-07 5.1), Custodian only; GET /loans (F-07 5.2), both roles. */
export function loansRouter(prisma: PrismaClient): Router {
  const router = Router();
  const service = loansService(prisma);

  // 401 → 403 → 400 before the service reads anything (contract F-03 3.7).
  router.post(
    "/requests/:id/checkout",
    authenticate(prisma),
    requireRole(Role.CUSTODIAN),
    validate({ params: requestIdParams, body: checkoutBody }),
    async (req, res, next) => {
      try {
        const { id } = req.params as unknown as { id: number };
        res.status(201).json(await service.checkout(req.user!, id, req.body as CheckoutBody));
      } catch (err) {
        next(err);
      }
    },
  );

  // Scope by role in the service (BR-05, F07-D5).
  router.get("/loans", authenticate(prisma), validate({ query: listLoansQuery }), async (req, res, next) => {
    try {
      res.status(200).json({ items: await service.list(req.user!, req.query as ListLoansQuery) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
