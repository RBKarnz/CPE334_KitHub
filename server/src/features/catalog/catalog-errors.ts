// Unique-violation mapping for catalog management (contract F-09 F09-D11). The SR-01 error handler
// answers every P2002 with the generic 409 CONFLICT, so the F-09 services map the violations they
// expect to the rule codes, as F-03 does for loans with toLoanInsertConflict.
import { Prisma } from "@prisma/client";
import { ConflictError } from "../../core/errors.js";

/**
 * The target of a P2002, or null for any other error. Prisma gives the field list (["name"],
 * ["assetTag"]) for indexes it knows and the index name ("categories_lower_name_key") for the
 * raw-SQL lower(name) indexes; both forms are joined into one string.
 */
export function uniqueViolationTarget(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.join(",") : String(target ?? "");
}

/** True for a P2002 on a name index: `name` or `<table>_lower_name_key`. */
export const isNameViolation = (err: unknown) => uniqueViolationTarget(err)?.includes("name") ?? false;

/** True for a P2002 on units.assetTag: `assetTag` or `units_assetTag_key`. */
export const isAssetTagViolation = (err: unknown) => uniqueViolationTarget(err)?.includes("assetTag") ?? false;

/** 409 NAME_TAKEN with the F09-D2 message. */
export const nameTaken = (kind: "category" | "item type", name: string) =>
  new ConflictError("NAME_TAKEN", `${kind === "category" ? "A category" : "An item type"} named ${name} already exists.`, [
    { field: "name", issue: "Name is already used" },
  ]);

/** 409 ASSET_TAG_TAKEN with the F09-D6 message. */
export const assetTagTaken = (assetTag: string) =>
  new ConflictError("ASSET_TAG_TAKEN", `Asset tag ${assetTag} is already used.`, [
    { field: "assetTag", issue: "Asset tag is already used" },
  ]);
