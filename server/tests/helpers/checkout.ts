// Shared setup and checks for checkout tests (contract F-03 section 8.1). Every test creates
// its own data with these helpers and the factories, never the demo seed.
import { LoanStatus, RequestStatus, UnitStatus, type PrismaClient } from "@prisma/client";
import request from "supertest";
import type { Express } from "express";
import { createBorrower, createCustodian, createItemType, createRequest } from "./factories.js";

export const DAY_MS = 86_400_000;

/**
 * What "Unchanged" means in contract F-03 3.6: the loans count, every request status, every
 * unit status and the history_entries count. A rejected checkout leaves all four equal.
 */
export async function snapshotCheckoutState(prisma: PrismaClient) {
  const [loans, history, requests, units] = await Promise.all([
    prisma.loan.count(),
    prisma.historyEntry.count(),
    prisma.borrowRequest.findMany({ select: { id: true, status: true }, orderBy: { id: "asc" } }),
    prisma.unit.findMany({ select: { id: true, status: true }, orderBy: { id: "asc" } }),
  ]);
  return { loans, history, requests, units };
}

/** The checkout body the UI sends in Sprint 1: exactly one entry (contract F-03 5.3). */
export const checkoutBody = (lineId: number, unitId: number) => ({ units: [{ lineId, unitId }] });

/** POST /api/requests/:id/checkout with Content-Type: application/json. */
export function postCheckout(app: Express, cookie: string | undefined, requestId: number | string, body: unknown) {
  const req = request(app).post(`/api/requests/${requestId}/checkout`).set("Content-Type", "application/json");
  return (cookie ? req.set("Cookie", cookie) : req).send(body as object);
}

/** GET /api/item-types/:id/units with an optional raw query string such as "status=AVAILABLE". */
export function getUnits(app: Express, cookie: string | undefined, itemTypeId: number | string, query = "") {
  const req = request(app).get(`/api/item-types/${itemTypeId}/units${query ? `?${query}` : ""}`);
  return cookie ? req.set("Cookie", cookie) : req;
}

/** The people and item types of contract F-03 8.1. */
export async function createCheckoutWorld(prisma: PrismaClient) {
  const c1 = await createCustodian(prisma, { username: "custodian1", displayName: "Custodian One" });
  const c2 = await createCustodian(prisma, { username: "custodian2", displayName: "Custodian Two" });
  const b1 = await createBorrower(prisma, { username: "borrower1", displayName: "Borrower One" });
  const b2 = await createBorrower(prisma, { username: "borrower2", displayName: "Borrower Two" });
  const arduino = await createItemType(prisma, { name: "Arduino Uno R3", maxLoanDays: 14 });
  const esp32 = await createItemType(prisma, { name: "ESP32 DevKitC", maxLoanDays: 14 });
  const multimeter = await createItemType(prisma, { name: "Digital multimeter", maxLoanDays: 3 });
  return { c1, c2, b1, b2, arduino, esp32, multimeter };
}

/**
 * Test data only: a CHECKED_OUT request of `borrowerId` whose line has one ACTIVE loan of
 * `unitId`, and that unit ON_LOAN. Written directly, so no history entry is created.
 */
export async function createActiveLoan(
  prisma: PrismaClient,
  options: { borrowerId: number; custodianId: number; itemTypeId: number; unitId: number },
) {
  const req = await createRequest(prisma, {
    borrowerId: options.borrowerId,
    itemTypeId: options.itemTypeId,
    status: RequestStatus.CHECKED_OUT,
  });
  await prisma.unit.update({ where: { id: options.unitId }, data: { status: UnitStatus.ON_LOAN } });
  const checkedOutAt = new Date();
  const loan = await prisma.loan.create({
    data: {
      requestLineId: req.lines[0].id,
      unitId: options.unitId,
      status: LoanStatus.ACTIVE,
      checkedOutAt,
      checkedOutById: options.custodianId,
      dueAt: new Date(checkedOutAt.getTime() + 14 * DAY_MS),
    },
  });
  return { request: req, loan };
}
