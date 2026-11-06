import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../../core/config.js";
import { authenticate } from "../../core/middleware/authenticate.js";
import { validate } from "../../core/middleware/validate.js";
import { loginBody, type LoginBody } from "./auth.schemas.js";
import { authService } from "./auth.service.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../../core/session.js";

export type AuthConfig = Pick<AppConfig, "sessionTtlHours" | "cookieSecure" | "bcryptCost">;

/** POST /auth/login, POST /auth/logout and GET /auth/me (contract F-01 section 4). */
export function authRouter(prisma: PrismaClient, config: AuthConfig): Router {
  const router = Router();
  const service = authService(prisma, config);

  // Login and logout run without authenticate (contract F-01 3.3).
  router.post("/auth/login", validate({ body: loginBody }), async (req, res, next) => {
    try {
      const { user, token } = await service.login(req.body as LoginBody, readSessionToken(req));
      setSessionCookie(res, token, config);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/logout", async (req, res, next) => {
    try {
      await service.logout(readSessionToken(req));
      clearSessionCookie(res, config);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get("/auth/me", authenticate(prisma), async (req, res, next) => {
    try {
      res.status(200).json({ user: await service.currentUser(req.user!.id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
