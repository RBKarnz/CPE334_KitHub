import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ValidationError, type ErrorDetail } from "../errors.js";

export interface RequestSchemas {
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
}

/** "units[0].unitId" style path, as in the SDS 6.5 example. */
function formatPath(prefix: string, path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, part) => {
    if (typeof part === "number") return `${acc}[${part}]`;
    const name = String(part);
    return acc ? `${acc}.${name}` : name;
  }, prefix);
}

/** One details entry per problem (SDS 6.4). */
export function zodIssuesToDetails(error: z.ZodError, location?: "params" | "query" | "body"): ErrorDetail[] {
  const prefix = location && location !== "body" ? location : "";
  return error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        field: formatPath(prefix, [...issue.path, key]) || key,
        issue: "Unknown field",
      }));
    }
    return [{ field: formatPath(prefix, issue.path) || location || "body", issue: issue.message }];
  });
}

/** Object schemas are made strict, so an unknown field is an error (DD-09). */
function strict(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodObject ? schema.strict() : schema;
}

/**
 * Validates path parameters, query and body before the service runs, and replaces them
 * with the parsed values. A failure gives 400 VALIDATION_FAILED with details.
 */
export function validate(schemas: RequestSchemas) {
  const compiled = (["params", "query", "body"] as const)
    .filter((location) => schemas[location] !== undefined)
    .map((location) => [location, strict(schemas[location] as z.ZodTypeAny)] as const);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const details: ErrorDetail[] = [];
    const parsedValues: Partial<Record<"params" | "query" | "body", unknown>> = {};
    for (const [location, schema] of compiled) {
      const input = location === "body" ? (req.body ?? {}) : req[location];
      const result = schema.safeParse(input);
      if (result.success) parsedValues[location] = result.data;
      else details.push(...zodIssuesToDetails(result.error, location));
    }
    if (details.length > 0) return next(new ValidationError(details));

    if ("params" in parsedValues) req.params = parsedValues.params as Request["params"];
    if ("query" in parsedValues) req.query = parsedValues.query as Request["query"];
    if ("body" in parsedValues) req.body = parsedValues.body;
    next();
  };
}
