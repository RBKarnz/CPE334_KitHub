import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "../errors.js";
import { zodIssuesToDetails } from "./validate.js";

/** Errors raised by express.json() (body-parser) carry a `type` and the raw `body` text. */
interface BodyParserError extends Error {
  type?: string;
  body?: unknown;
}

/** True when the raw body is valid JSON, so body-parser rejected it only for not being an object or array. */
function isValidJson(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/** Turns any thrown value into a known AppError. Unknown errors become 500. */
export function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new ValidationError(zodIssuesToDetails(err));

  const type = (err as BodyParserError | undefined)?.type;
  if (type === "entity.parse.failed") {
    // express.json() is strict: a body such as `null` or `"text"` is valid JSON but not an object.
    if (isValidJson((err as BodyParserError).body))
      return new ValidationError([{ field: "body", issue: "Must be a JSON object" }], "The request body must be a JSON object.");
    return new ValidationError([{ field: "body", issue: "Malformed JSON" }], "The request body is not valid JSON.");
  }
  if (type === "entity.too.large")
    return new ValidationError([{ field: "body", issue: "Larger than 100 KB" }], "The request body is too large.");
  if (type === "charset.unsupported" || type === "encoding.unsupported") return new UnsupportedMediaTypeError();

  // A unique violation means the record conflicts with an existing one. Feature
  // contracts map specific constraints to their rule codes (SDS 6.5) in the service.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    return new ConflictError("CONFLICT", "The record conflicts with an existing record.");

  return null;
}

/** 404 NOT_FOUND for any /api path that no router handled (SDS 6.1). */
export function apiNotFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError());
}

/**
 * The single place that builds error responses (SDS 6.5, NFR-08). Stack traces, SQL and
 * Prisma messages are logged on the server and never sent to the client.
 */
export function errorHandler(logErrors: boolean) {
  // Express recognises an error handler by its four parameters.
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(err);

    const known = toAppError(err);
    const status = known?.status ?? 500;
    const code = known?.code ?? "INTERNAL_ERROR";
    const message = known?.message ?? "Something went wrong.";

    if (!known && logErrors) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(
        JSON.stringify({
          time: new Date().toISOString(),
          level: "error",
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          error: e.name,
          message: e.message,
          stack: e.stack,
        }),
      );
    }

    res.status(status).json({
      error: {
        code,
        message,
        ...(known?.details && known.details.length > 0 ? { details: known.details } : {}),
        requestId: req.requestId,
      },
    });
  };
}
