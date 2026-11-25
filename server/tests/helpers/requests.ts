// Shared checks for request tests (contract F-02 section 8.1).
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import type { Express } from "express";

/**
 * What "Unchanged" means for request tests (contract F-02 8.1, extended by F-06 8.1): the row
 * counts, every request's state and decision columns, every unit's status and the loans count.
 * A rejected create, decision, edit or cancel leaves all of it equal.
 */
export async function snapshotRequestState(prisma: PrismaClient) {
  return {
    requests: await prisma.borrowRequest.count(),
    lines: await prisma.requestLine.count(),
    history: await prisma.historyEntry.count(),
    loans: await prisma.loan.count(),
    requestRows: await prisma.borrowRequest.findMany({
      orderBy: { id: "asc" },
      select: { id: true, status: true, loanDays: true, decidedById: true, decidedAt: true, rejectionReason: true, updatedAt: true },
    }),
    units: await prisma.unit.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } }),
  };
}

/** POST /api/requests/:id/approve or /reject with Content-Type: application/json (contract F-06 5.1, 5.2). */
export function postDecision(
  app: Express,
  cookie: string | undefined,
  requestId: number | string,
  decision: "approve" | "reject",
  body: unknown,
) {
  const req = request(app).post(`/api/requests/${requestId}/${decision}`).set("Content-Type", "application/json");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
}

/** GET with an optional session cookie. */
export function getAs(app: Express, cookie: string | undefined, path: string) {
  const req = request(app).get(path);
  return cookie ? req.set("Cookie", cookie) : req;
}

/** POST /api/requests with one line, as the UI sends it. */
export function postRequest(app: Express, cookie: string | undefined, body: unknown) {
  const req = request(app).post("/api/requests").set("Content-Type", "application/json");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
}

export const oneLine = (itemTypeId: number) => ({ lines: [{ itemTypeId, quantity: 1 }] });

/** The detail fields of a `details` array, for "names the field" checks. */
export const detailFields = (res: request.Response): string[] =>
  (res.body.error?.details ?? []).map((d: { field: string }) => d.field);
