import type { NextFunction, Request, Response } from "express";
import { UnsupportedMediaTypeError } from "../errors.js";

const METHODS_WITH_BODY = new Set(["POST", "PATCH", "PUT"]);

/**
 * POST and PATCH must send Content-Type: application/json, or get 415 (SDS 6.2).
 * Checks the header itself, so a JSON POST with an empty body (for example sign-out) passes.
 */
export function requireJson(req: Request, _res: Response, next: NextFunction): void {
  if (!METHODS_WITH_BODY.has(req.method)) return next();
  const mediaType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return next(new UnsupportedMediaTypeError());
  next();
}
