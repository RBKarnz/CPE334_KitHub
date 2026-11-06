import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** UUID of this call; matches the X-Request-Id header and the log line (SDS 6.5). */
      requestId: string;
    }
  }
}

/** Gives every call a fresh UUID and returns it in X-Request-Id. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

/** Private data must not be cached by the browser or a proxy (SDS 6.3). */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

/**
 * One JSON line per API call (SDS 9.8): time, requestId, method, path, status,
 * duration and user ID when signed in. Never logs bodies, cookies, query strings or secrets.
 */
export function requestLogger(enabled: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) return next();
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const userId = (req as { user?: { id?: number } }).user?.id;
      const line = {
        time: new Date().toISOString(),
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / 1000n) / 1000,
        ...(userId !== undefined ? { userId } : {}),
      };
      console.log(JSON.stringify(line));
    });
    next();
  };
}
