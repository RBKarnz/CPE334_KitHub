// Checkout of an APPROVED request with one unit per quantity on each line (contract F-07 3, SDS
// 4.7; replaces the Sprint 1 checkout of a PENDING request, F07-D1), and the loan lists (F-07 5.2).
import {
  ActorType,
  HistoryEntity,
  LoanStatus,
  RequestStatus,
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
import type { CheckoutBody, ListLoansQuery } from "./loans.schemas.js";

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
      return rows.map(({ requestLine, ...loan }) => ({
        ...loan,
        itemType: requestLine.itemType,
        request: { id: requestLine.request.id },
        ...(custodian ? { borrower: requestLine.request.borrower } : {}),
      }));
    },
  };
}
