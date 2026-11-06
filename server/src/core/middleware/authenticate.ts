import type { NextFunction, Request, Response } from "express";
import type { PrismaClient, Role } from "@prisma/client";
import { ForbiddenError, UnauthenticatedError } from "../errors.js";
import { readSessionToken, sessionIdFor } from "../session.js";

export interface AuthUser {
  id: number;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by authenticate. The role comes from users on every call, never from the client (SDS 7.2). */
      user?: AuthUser;
    }
  }
}

/**
 * Every /api route except login, logout, health and ready (SDS 7.2 step 1). Loads the session
 * by the SHA-256 of the cookie token, only while it has not expired, and sets req.user.
 * Otherwise 401 UNAUTHENTICATED.
 */
export function authenticate(prisma: PrismaClient) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readSessionToken(req);
      const session = token
        ? await prisma.session.findFirst({
            where: { id: sessionIdFor(token), expiresAt: { gt: new Date() } },
            select: { user: { select: { id: true, role: true } } },
          })
        : null;
      if (!session) return next(new UnauthenticatedError("You are not signed in."));
      req.user = session.user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 403 FORBIDDEN unless req.user has one of the roles. Goes after authenticate and before
 * validate, so no record is read for the wrong role (SDS 6.5 order).
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthenticatedError("You are not signed in."));
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}
