// Checkout of an APPROVED request with one unit per quantity on each line (contract F-07 3, SDS
// 4.7; replaces the Sprint 1 checkout of a PENDING request, F07-D1), the loan lists (F-07 5.2), and
// returns: return all and early return of one unit (contract F-08 3).
import {
  ActorType,
  HistoryEntity,
  LoanStatus,
  RequestStatus,
  ReturnCondition,
  Role,
  UnitStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { AuthUser } from "../../core/middleware/authenticate.js";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors.js";
import { computeDueAt } from "../../domain/due-date.js";
import { assertTransition } from "../../domain/transitions.js";
import { requestsService } from "../requests/requests.service.js";
import { requestSelect } from "../requests/requests.view.js";
import { toLoanInsertConflict, unitNotAvailable } from "./checkout-errors.js";
import type { CheckoutBody, ListLoansQuery, ReturnAllBody } from "./loans.schemas.js";

const lineField = (i: number) => `units[${i}].lineId`;
const unitField = (i: number) => `units[${i}].unitId`;
const units = (n: number) => `${n} unit${n === 1 ? "" : "s"}`;

const userSummary = { select: { id: true, username: true, displayName: true } } as const;

const loanSelect = {
  id: true,
  status: true,
  checkedOutAt: true,
  dueAt: true,
  returnedAt: true,
  returnCondition: true,
  returnedBy: userSummary,
  unit: { select: { id: true, assetTag: true } },
  requestLine: {
    select: { itemType: { select: { id: true, name: true } }, request: { select: { id: true, borrower: userSummary } } },
  },
} satisfies Prisma.LoanSelect;

export function loansService(prisma: PrismaClient) {
  return {
    /**
     * Checks out every unit of an APPROVED request in one transaction (all or nothing, F07-D2).
     * Check order after the schema (contract F-07 3.5): request exists (404), each unit exists in
     * body order (404), every lineId is a line of the request (400), no unit twice (400), each
     * line gets exactly its quantity (400), request APPROVED (409 INVALID_STATE), then per unit in
     * ascending ID: of the line's item type (409 UNIT_WRONG_ITEM_TYPE), AVAILABLE (409
     * UNIT_NOT_AVAILABLE). Units are moved in ascending ID order, so two checkouts that share units
     * cannot deadlock (3.7).
     */
    async checkout(user: AuthUser, requestId: number, body: CheckoutBody) {
      await prisma.$transaction(async (tx) => {
        // One instant for checkedOutAt, the dueAt base and every history entry (F03-D5).
        const now = new Date();

        const request = await tx.borrowRequest.findUnique({
          where: { id: requestId },
          select: {
            loanDays: true,
            lines: {
              orderBy: { id: "asc" },
              select: { id: true, quantity: true, itemTypeId: true, itemType: { select: { name: true, maxLoanDays: true } } },
            },
          },
        });
        if (!request) throw new NotFoundError(`Request #${requestId} does not exist.`);

        // Each named unit exists, in body order. Units are never deleted, so this read stays valid.
        const found = new Map<number, { id: number; assetTag: string; itemTypeId: number; itemType: { name: string } }>();
        for (const [i, entry] of body.units.entries()) {
          if (found.has(entry.unitId)) continue;
          const unit = await tx.unit.findUnique({
            where: { id: entry.unitId },
            select: { id: true, assetTag: true, itemTypeId: true, itemType: { select: { name: true } } },
          });
          if (!unit)
            throw new NotFoundError(`Unit ${entry.unitId} does not exist.`, [
              { field: unitField(i), issue: "Unit does not exist" },
            ]);
          found.set(unit.id, unit);
        }

        // Lines: every lineId belongs to this request; its item type comes from the database.
        const lines = new Map(request.lines.map((l) => [l.id, l]));
        for (const [i, entry] of body.units.entries()) {
          if (!lines.has(entry.lineId))
            throw new ValidationError(
              [{ field: lineField(i), issue: `Not a line of request #${requestId}` }],
              `Line ${entry.lineId} is not a line of request #${requestId}.`,
            );
        }
        const seen = new Set<number>();
        for (const [i, entry] of body.units.entries()) {
          if (seen.has(entry.unitId))
            throw new ValidationError(
              [{ field: unitField(i), issue: `Unit ${entry.unitId} is listed twice` }],
              `Unit ${entry.unitId} is listed twice.`,
            );
          seen.add(entry.unitId);
        }
        // Each line gets exactly its quantity, and every line appears (FR-17, BR-06).
        for (const line of request.lines) {
          const got = body.units.filter((e) => e.lineId === line.id).length;
          if (got !== line.quantity) {
            const issue = `Line ${line.id} needs ${units(line.quantity)}, got ${got}`;
            throw new ValidationError([{ field: "units", issue }], `${issue}.`);
          }
        }

        // The request: APPROVED → CHECKED_OUT; 0 rows → re-read so the message names its state.
        assertTransition("REQUEST", RequestStatus.APPROVED, RequestStatus.CHECKED_OUT);
        const movedRequest = await tx.borrowRequest.updateMany({
          where: { id: requestId, status: RequestStatus.APPROVED },
          data: { status: RequestStatus.CHECKED_OUT },
        });
        if (movedRequest.count === 0) {
          const current = await tx.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } });
          throw new ConflictError(
            "INVALID_STATE",
            `Request #${requestId} cannot be checked out because it is ${current.status}, not APPROVED.`,
          );
        }

        // One due date for every loan (F07-D3): the request's loan length, or for a request without
        // one the smallest maxLoanDays of its item types (D-16).
        const days = request.loanDays ?? Math.min(...request.lines.map((l) => l.itemType.maxLoanDays));
        const dueAt = computeDueAt(now, days);

        // Units in ascending ID order (3.7). BR-02, BR-03, BR-12: the conditional update succeeds
        // only for an AVAILABLE unit of the line's item type.
        const ordered = body.units
          .map((entry, index) => ({ ...entry, index }))
          .sort((a, b) => a.unitId - b.unitId);
        assertTransition("UNIT", UnitStatus.AVAILABLE, UnitStatus.ON_LOAN);
        assertTransition("LOAN", null, LoanStatus.ACTIVE);
        const created: { unitId: number; loanId: number }[] = [];
        for (const entry of ordered) {
          const unit = found.get(entry.unitId)!;
          const line = lines.get(entry.lineId)!;
          const moved = await tx.unit.updateMany({
            where: { id: unit.id, itemTypeId: line.itemTypeId, status: UnitStatus.AVAILABLE },
            data: { status: UnitStatus.ON_LOAN },
          });
          if (moved.count === 0) {
            if (unit.itemTypeId !== line.itemTypeId)
              throw new ConflictError(
                "UNIT_WRONG_ITEM_TYPE",
                `Unit ${unit.assetTag} is not a unit of ${line.itemType.name}.`,
                [{ field: unitField(entry.index), issue: `Unit belongs to item type ${unit.itemType.name}` }],
              );
            // Fresh read: a concurrent checkout may have committed after the first read.
            const current = await tx.unit.findUniqueOrThrow({ where: { id: unit.id }, select: { status: true } });
            throw unitNotAvailable(unit.assetTag, `Unit is ${current.status}`, unitField(entry.index));
          }
          try {
            const loan = await tx.loan.create({
              data: {
                requestLineId: line.id,
                unitId: unit.id,
                status: LoanStatus.ACTIVE,
                checkedOutAt: now,
                checkedOutById: user.id,
                dueAt,
              },
              select: { id: true },
            });
            created.push({ unitId: unit.id, loanId: loan.id });
          } catch (err) {
            // Backstop: loans_one_active_per_unit (contract F-03 3.9).
            throw toLoanInsertConflict(err, unit, unitField(entry.index));
          }
        }

        // History: 1 request entry, n unit entries, n loan entries (contract F-07 3.6).
        const actor = { occurredAt: now, actorType: ActorType.USER, actorUserId: user.id, requestId };
        await tx.historyEntry.createMany({
          data: [
            {
              ...actor,
              entityType: HistoryEntity.REQUEST,
              action: "STATUS_CHANGED",
              fromStatus: RequestStatus.APPROVED,
              toStatus: RequestStatus.CHECKED_OUT,
            },
            ...created.map(({ unitId }) => ({
              ...actor,
              entityType: HistoryEntity.UNIT,
              unitId,
              action: "STATUS_CHANGED",
              fromStatus: UnitStatus.AVAILABLE,
              toStatus: UnitStatus.ON_LOAN,
            })),
            ...created.map(({ unitId, loanId }) => ({
              ...actor,
              entityType: HistoryEntity.LOAN,
              unitId,
              loanId,
              action: "CREATED",
              fromStatus: null,
              toStatus: LoanStatus.ACTIVE,
            })),
          ],
        });
      });

      // The request in the caller's detail shape, with its new loans (contract F-07 5.1).
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: requestSelect });
      return requestsService(prisma).detail(user, row);
    },

    /**
     * Loans in `status` (ACTIVE by default), earliest due first (F07-D5). A Borrower sees only
     * loans of their own requests (BR-05); a Custodian sees every loan with its Borrower.
     */
    async list(user: AuthUser, query: ListLoansQuery) {
      const custodian = user.role === Role.CUSTODIAN;
      const rows = await prisma.loan.findMany({
        where: {
          status: query.status ?? LoanStatus.ACTIVE,
          ...(custodian ? {} : { requestLine: { request: { borrowerId: user.id } } }),
        },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        select: loanSelect,
      });
      return rows.map(({ requestLine, returnedBy, ...loan }) => ({
        ...loan,
        itemType: requestLine.itemType,
        request: { id: requestLine.request.id },
        ...(custodian ? { borrower: requestLine.request.borrower, returnedBy } : {}),
      }));
    },

    /**
     * Returns every ACTIVE loan of a CHECKED_OUT request (FR-20, F08-D1). Check order after the
     * schema (contract F-08 3.5): request exists (404); request CHECKED_OUT (409); every named loan
     * is a loan of this request and appears once (400); every named loan is ACTIVE (409); no
     * ACTIVE loan is missing (400). The request row is locked first, so returns of one request run
     * one after another (3.7).
     */
    async returnAll(user: AuthUser, requestId: number, body: ReturnAllBody) {
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        const status = await lockRequest(tx, requestId);
        if (status === null) throw new NotFoundError(`Request ${requestId} does not exist.`);
        if (status !== RequestStatus.CHECKED_OUT) throw requestNotReturnable(requestId, status);

        const loans = await tx.loan.findMany({
          where: { requestLine: { requestId } },
          select: { id: true, status: true },
        });
        const byId = new Map(loans.map((l) => [l.id, l]));
        const seen = new Set<number>();
        for (const [i, entry] of body.loans.entries()) {
          if (!byId.has(entry.loanId))
            throw new ValidationError(
              [{ field: `loans[${i}].loanId`, issue: `Loan ${entry.loanId} is not a loan of request #${requestId}` }],
              `Loan ${entry.loanId} is not a loan of request #${requestId}.`,
            );
          if (seen.has(entry.loanId))
            throw new ValidationError(
              [{ field: `loans[${i}].loanId`, issue: `Loan ${entry.loanId} is listed twice` }],
              `Loan ${entry.loanId} is listed twice.`,
            );
          seen.add(entry.loanId);
        }
        for (const entry of body.loans) {
          const loan = byId.get(entry.loanId)!;
          if (loan.status !== LoanStatus.ACTIVE) throw loanNotReturnable(loan.id, loan.status);
        }
        const missing = loans.filter((l) => l.status === LoanStatus.ACTIVE && !seen.has(l.id)).length;
        if (missing > 0) {
          const issue = `${missing} active loan${missing === 1 ? " is" : "s are"} missing`;
          throw new ValidationError([{ field: "loans", issue }], `${issue}.`);
        }

        const ordered = [...body.loans].sort((a, b) => a.loanId - b.loanId);
        for (const entry of ordered) await returnOne(tx, user, requestId, entry.loanId, entry.condition, now);
        await endRequest(tx, user, requestId, now);
      });
      return this.requestDetail(user, requestId);
    },

    /**
     * Early return of one ACTIVE loan (FR-21). When it was the request's last ACTIVE loan, the
     * request becomes RETURNED (F08-D2). The request row is locked before the count, so of two
     * simultaneous last returns exactly one ends the request (3.7).
     */
    async returnLoan(user: AuthUser, loanId: number, condition: ReturnCondition | undefined) {
      const requestId = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const loan = await tx.loan.findUnique({ where: { id: loanId }, select: { requestLine: { select: { requestId: true } } } });
        if (!loan) throw new NotFoundError(`Loan ${loanId} does not exist.`);
        const owner = loan.requestLine.requestId;
        const status = await lockRequest(tx, owner);
        // The call names a loan, so its own state answers first (contract F-08 3.5).
        const current = await tx.loan.findUniqueOrThrow({ where: { id: loanId }, select: { status: true } });
        if (current.status !== LoanStatus.ACTIVE) throw loanNotReturnable(loanId, current.status);
        if (status !== RequestStatus.CHECKED_OUT) throw requestNotReturnable(owner, String(status));
        await returnOne(tx, user, owner, loanId, condition, now);
        const left = await tx.loan.count({ where: { requestLine: { requestId: owner }, status: LoanStatus.ACTIVE } });
        if (left === 0) await endRequest(tx, user, owner, now);
        return owner;
      });
      return this.requestDetail(user, requestId);
    },

    /** The request in the caller's detail shape (F08-D4). */
    async requestDetail(user: AuthUser, requestId: number) {
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: requestSelect });
      return requestsService(prisma).detail(user, row);
    },
  };
}

type Tx = Prisma.TransactionClient;

/** Locks the request row for the rest of the transaction and returns its state, or null. */
async function lockRequest(tx: Tx, requestId: number): Promise<RequestStatus | null> {
  const rows = await tx.$queryRaw<{ status: RequestStatus }[]>`
    SELECT status FROM borrow_requests WHERE id = ${requestId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

const requestNotReturnable = (requestId: number, status: string) =>
  new ConflictError("INVALID_STATE", `Request #${requestId} cannot be returned because it is ${status}, not CHECKED_OUT.`);

const loanNotReturnable = (loanId: number, status: string) =>
  new ConflictError("INVALID_STATE", `Loan ${loanId} cannot be returned because it is ${status}, not ACTIVE.`);

/**
 * One loan ACTIVE -> RETURNED with its unit ON_LOAN -> AVAILABLE (GOOD) or MAINTENANCE (DAMAGED,
 * BR-11), and their two history entries (contract F-08 3.2, 3.6). Conditional updates: a loan
 * returned by another call meanwhile gives 409 with its state from a fresh read.
 */
async function returnOne(
  tx: Tx,
  user: AuthUser,
  requestId: number,
  loanId: number,
  condition: ReturnCondition | undefined,
  now: Date,
) {
  const chosen = condition ?? ReturnCondition.GOOD;
  const unitTo = chosen === ReturnCondition.DAMAGED ? UnitStatus.MAINTENANCE : UnitStatus.AVAILABLE;
  assertTransition("LOAN", LoanStatus.ACTIVE, LoanStatus.RETURNED);
  assertTransition("UNIT", UnitStatus.ON_LOAN, unitTo);
  const moved = await tx.loan.updateMany({
    where: { id: loanId, status: LoanStatus.ACTIVE },
    data: { status: LoanStatus.RETURNED, returnedAt: now, returnedById: user.id, returnCondition: chosen },
  });
  if (moved.count === 0) {
    const current = await tx.loan.findUniqueOrThrow({ where: { id: loanId }, select: { status: true } });
    throw loanNotReturnable(loanId, current.status);
  }
  const { unitId } = await tx.loan.findUniqueOrThrow({ where: { id: loanId }, select: { unitId: true } });
  const movedUnit = await tx.unit.updateMany({ where: { id: unitId, status: UnitStatus.ON_LOAN }, data: { status: unitTo } });
  if (movedUnit.count === 0) {
    // The unit no longer matches its ACTIVE loan: refuse, so the whole return rolls back and no
    // history records a change that did not happen (BR-16, review of PR #94).
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, select: { assetTag: true, status: true } });
    throw new ConflictError("INVALID_STATE", `Unit ${unit.assetTag} is ${unit.status}, not ON_LOAN.`);
  }
  const actor = { occurredAt: now, actorType: ActorType.USER, actorUserId: user.id, requestId, unitId };
  await tx.historyEntry.createMany({
    data: [
      {
        ...actor,
        entityType: HistoryEntity.LOAN,
        loanId,
        action: "STATUS_CHANGED",
        fromStatus: LoanStatus.ACTIVE,
        toStatus: LoanStatus.RETURNED,
        details: { condition: chosen },
      },
      { ...actor, entityType: HistoryEntity.UNIT, action: "STATUS_CHANGED", fromStatus: UnitStatus.ON_LOAN, toStatus: unitTo },
    ],
  });
}

/** CHECKED_OUT -> RETURNED with its history entry, once no ACTIVE loan is left (FR-20, FR-21). */
async function endRequest(tx: Tx, user: AuthUser, requestId: number, now: Date) {
  assertTransition("REQUEST", RequestStatus.CHECKED_OUT, RequestStatus.RETURNED);
  await tx.borrowRequest.update({ where: { id: requestId }, data: { status: RequestStatus.RETURNED } });
  await tx.historyEntry.create({
    data: {
      occurredAt: now,
      actorType: ActorType.USER,
      actorUserId: user.id,
      entityType: HistoryEntity.REQUEST,
      requestId,
      action: "STATUS_CHANGED",
      fromStatus: RequestStatus.CHECKED_OUT,
      toStatus: RequestStatus.RETURNED,
    },
  });
}
