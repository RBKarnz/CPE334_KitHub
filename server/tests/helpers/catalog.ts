// Shared setup and checks for catalog management tests (contract F-09 section 8.1).
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import type { Express } from "express";

/**
 * What "Unchanged" means in contract F-09 8.1: every categories, item_types and units row (all
 * columns) and the history_entries count. A rejected call leaves all four equal.
 */
export async function snapshotCatalogState(prisma: PrismaClient) {
  const [categories, itemTypes, units, history] = await Promise.all([
    prisma.category.findMany({ orderBy: { id: "asc" } }),
    prisma.itemType.findMany({ orderBy: { id: "asc" } }),
    prisma.unit.findMany({ orderBy: { id: "asc" } }),
    prisma.historyEntry.count(),
  ]);
  return { categories, itemTypes, units, history };
}

/** A POST or PATCH with Content-Type: application/json, with or without a session cookie. */
export function sendJson(app: Express, method: "post" | "patch", path: string, cookie: string | undefined, body: unknown) {
  const req = request(app)[method](path).set("Content-Type", "application/json");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
}

export const postCategory = (app: Express, cookie: string | undefined, body: unknown) =>
  sendJson(app, "post", "/api/categories", cookie, body);
export const patchCategory = (app: Express, cookie: string | undefined, id: number | string, body: unknown) =>
  sendJson(app, "patch", `/api/categories/${id}`, cookie, body);
export const postItemType = (app: Express, cookie: string | undefined, body: unknown) =>
  sendJson(app, "post", "/api/item-types", cookie, body);
export const patchItemType = (app: Express, cookie: string | undefined, id: number | string, body: unknown) =>
  sendJson(app, "patch", `/api/item-types/${id}`, cookie, body);
export const postUnit = (app: Express, cookie: string | undefined, itemTypeId: number | string, body: unknown) =>
  sendJson(app, "post", `/api/item-types/${itemTypeId}/units`, cookie, body);
export const repairUnit = (app: Express, cookie: string | undefined, unitId: number | string, body: unknown = {}) =>
  sendJson(app, "post", `/api/units/${unitId}/repair`, cookie, body);
export const retireUnit = (app: Express, cookie: string | undefined, unitId: number | string, body: unknown = {}) =>
  sendJson(app, "post", `/api/units/${unitId}/retire`, cookie, body);

/** GET /api/categories as `cookie`; returns the items. */
export async function listCategories(app: Express, cookie: string) {
  const res = await request(app).get("/api/categories").set("Cookie", cookie);
  if (res.status !== 200) throw new Error(`GET /api/categories failed with ${res.status}`);
  return res.body.items as {
    id: number;
    name: string;
    defaultMaxLoanDays: number;
    defaultMaxQuantity: number;
    itemTypes: { id: number; name: string; maxLoanDays: number; maxQuantityPerRequest: number; availableCount: number }[];
  }[];
}

/** The item type `id` as GET /api/categories lists it. */
export async function listedItemType(app: Express, cookie: string, id: number) {
  const found = (await listCategories(app, cookie)).flatMap((c) => c.itemTypes).find((t) => t.id === id);
  if (!found) throw new Error(`item type ${id} is not in GET /api/categories`);
  return found;
}

/** The `field` of every details entry of an error response. */
export const detailFields = (res: request.Response) =>
  ((res.body.error?.details ?? []) as { field: string }[]).map((d) => d.field);
