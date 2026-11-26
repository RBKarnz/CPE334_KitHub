// Shared setup for return tests (contract F-08 section 8): CHECKED_OUT requests with ACTIVE loans,
// written directly as test data, and the two return calls.
import { LoanStatus, RequestStatus, UnitStatus, type PrismaClient } from "@prisma/client";
import request from "supertest";
import type { Express } from "express";
import { addLine, createRequest, createUnit } from "./factories.js";

/**
 * A CHECKED_OUT request of `borrowerId` with one ACTIVE loan per unit in `lines`. Each line is an
 * item type and the units to lend for it; the units are created ON_LOAN. No history is written.
 */
export async function createCheckedOutRequest(
  prisma: PrismaClient,
  options: {
    borrowerId: number;
    custodianId: number;
    lines: { itemTypeId: number; assetTags: string[] }[];
  },
) {
  const [first, ...rest] = options.lines;
  const r = await createRequest(prisma, {
    borrowerId: options.borrowerId,
    itemTypeId: first.itemTypeId,
    quantity: first.assetTags.length,
    status: RequestStatus.CHECKED_OUT,
    loanDays: 7,
  });
  const lines = [r.lines[0], ...(await Promise.all(rest.map((l) => addLine(prisma, r.id, l.itemTypeId, l.assetTags.length))))];
  const loans = [];
  for (const [i, line] of options.lines.entries()) {
    for (const assetTag of line.assetTags) {
      const unit = await createUnit(prisma, { itemTypeId: line.itemTypeId, assetTag, status: UnitStatus.ON_LOAN });
      const loan = await prisma.loan.create({
        data: {
          requestLineId: lines[i].id,
          unitId: unit.id,
          status: LoanStatus.ACTIVE,
          checkedOutAt: new Date("2026-11-30T03:00:00.000Z"),
          checkedOutById: options.custodianId,
          dueAt: new Date("2026-12-07T10:00:00.000Z"),
        },
      });
      loans.push({ ...loan, unit });
    }
  }
  return { request: r, loans };
}

/** POST /api/requests/:id/return with Content-Type: application/json (contract F-08 5.1). */
export function postReturnAll(app: Express, cookie: string | undefined, requestId: number | string, body: unknown) {
  const req = request(app).post(`/api/requests/${requestId}/return`).set("Content-Type", "application/json");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
}

/** POST /api/loans/:id/return with Content-Type: application/json (contract F-08 5.2). */
export function postReturnLoan(app: Express, cookie: string | undefined, loanId: number | string, body: unknown) {
  const req = request(app).post(`/api/loans/${loanId}/return`).set("Content-Type", "application/json");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
}
