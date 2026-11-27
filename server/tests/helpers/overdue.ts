// Shared setup for F-11 tests (contract F-11 8.1): CHECKED_OUT requests whose ACTIVE loans have a
// chosen dueAt, written directly as test data (no history), and a fixed clock.
import { LoanStatus, RequestStatus, UnitStatus, type PrismaClient } from "@prisma/client";
import { vi } from "vitest";
import { addLine, createRequest, createUnit } from "./factories.js";

/** Fakes only JavaScript Date (contract F-03 v1.3 8.1, F-11 8.1); database defaults keep their clock. */
export function fixClock(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
}

/**
 * A CHECKED_OUT request of `borrowerId` with `count` ACTIVE loans per line, every loan due at
 * `dueAt`. The units are created ON_LOAN.
 */
export async function createLoanedRequest(
  prisma: PrismaClient,
  options: { borrowerId: number; custodianId: number; dueAt: string; lines: { itemTypeId: number; count: number }[] },
) {
  const [first, ...rest] = options.lines;
  const r = await createRequest(prisma, {
    borrowerId: options.borrowerId,
    itemTypeId: first.itemTypeId,
    quantity: first.count,
    status: RequestStatus.CHECKED_OUT,
    loanDays: 3,
  });
  const lines = [r.lines[0], ...(await Promise.all(rest.map((l) => addLine(prisma, r.id, l.itemTypeId, l.count))))];
  const loans = [];
  for (const [i, line] of options.lines.entries()) {
    for (let n = 0; n < line.count; n++) {
      const unit = await createUnit(prisma, { itemTypeId: line.itemTypeId, status: UnitStatus.ON_LOAN });
      loans.push(
        await prisma.loan.create({
          data: {
            requestLineId: lines[i].id,
            unitId: unit.id,
            status: LoanStatus.ACTIVE,
            checkedOutAt: new Date("2026-11-30T03:00:00.000Z"),
            checkedOutById: options.custodianId,
            dueAt: new Date(options.dueAt),
          },
        }),
      );
    }
  }
  return { request: r, loans };
}

/** Test data only: marks one loan returned in good condition and its unit AVAILABLE. */
export async function markReturned(prisma: PrismaClient, loanId: number, custodianId: number) {
  const loan = await prisma.loan.update({
    where: { id: loanId },
    data: { status: LoanStatus.RETURNED, returnedAt: new Date("2026-12-01T03:00:00.000Z"), returnedById: custodianId, returnCondition: "GOOD" },
  });
  await prisma.unit.update({ where: { id: loan.unitId }, data: { status: UnitStatus.AVAILABLE } });
}
