// Shared checks for request tests (contract F-02 section 8.1).
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import type { Express } from "express";

/** Row counts that a rejected create must leave unchanged ("nothing is stored"). */
export async function snapshotRequestState(prisma: PrismaClient) {
  return {
    requests: await prisma.borrowRequest.count(),
    lines: await prisma.requestLine.count(),
    history: await prisma.historyEntry.count(),
  };
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
