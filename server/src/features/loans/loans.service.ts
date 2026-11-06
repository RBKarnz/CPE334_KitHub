// Sprint 1 checkout of a pending request (contract F-03 3, SDS 4.7).
import {
  ActorType,
  HistoryEntity,
  LoanStatus,
  RequestStatus,
  UnitStatus,
  type PrismaClient,
} from "@prisma/client";
import type { AuthUser } from "../../core/middleware/authenticate.js";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors.js";
import { computeDueAt } from "../../domain/due-date.js";
import { assertTransition } from "../../domain/transitions.js";
import { requestSelect, toRequestView } from "../requests/requests.view.js";
import { LINE_FIELD, UNIT_FIELD, toLoanInsertConflict, unitNotAvailable } from "./checkout-errors.js";
import type { CheckoutBody } from "./loans.schemas.js";

export function loansService(prisma: PrismaClient) {
  return {
    /**
     * Checks out one AVAILABLE unit for a PENDING request in one transaction: request
     * PENDING → CHECKED_OUT, unit AVAILABLE → ON_LOAN, a new ACTIVE loan and three history
     * entries. Check order after the schema (contract F-03 3.7): request exists (404), unit
     * exists (404), lineId belongs to the request (400), request PENDING (409 INVALID_STATE),
     * unit of the line's item type (409 UNIT_WRONG_ITEM_TYPE), unit AVAILABLE and no other
     * ACTIVE loan (409 UNIT_NOT_AVAILABLE). Any error rolls every write back.
     */
    async checkout(user: AuthUser, requestId: number, body: CheckoutBody) {
      const [{ lineId, unitId }] = body.units;

      await prisma.$transaction(async (tx) => {
        // One instant for checkedOutAt, the dueAt base and every history entry (F03-D5).
        const now = new Date();

        // Steps 4 and 5: the records exist. Units are never deleted, so this read stays valid.
        const request = await tx.borrowRequest.findUnique({
          where: { id: requestId },
          select: {
            lines: {
              select: { id: true, itemTypeId: true, itemType: { select: { name: true, maxLoanDays: true } } },
            },
          },
        });
        if (!request) throw new NotFoundError(`Request #${requestId} does not exist.`);
        const unit = await tx.unit.findUnique({
          where: { id: unitId },
          select: { id: true, assetTag: true, itemTypeId: true, itemType: { select: { name: true } } },
        });
        if (!unit)
          throw new NotFoundError(`Unit ${unitId} does not exist.`, [{ field: UNIT_FIELD, issue: "Unit does not exist" }]);

        // Step 6: the line belongs to this request. Its item type comes from the database, never the client.
        const line = request.lines.find((l) => l.id === lineId);
        if (!line)
          throw new ValidationError(
            [{ field: LINE_FIELD, issue: `Not a line of request #${requestId}` }],
            `Line ${lineId} is not a line of request #${requestId}.`,
          );

        // Step 7: lock order request first, then unit (SDS 4.7). 0 rows: the request is no
        // longer PENDING; re-read it so the message names its current state.
        assertTransition("REQUEST", RequestStatus.PENDING, RequestStatus.CHECKED_OUT);
        const movedRequest = await tx.borrowRequest.updateMany({
          where: { id: requestId, status: RequestStatus.PENDING },
          data: { status: RequestStatus.CHECKED_OUT },
        });
        if (movedRequest.count === 0) {
          const current = await tx.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } });
          throw new ConflictError(
            "INVALID_STATE",
            `Request #${requestId} cannot be checked out because it is ${current.status}, not PENDING.`,
          );
        }

        // Steps 8 and 9 (BR-02, BR-03): the conditional update succeeds only for an AVAILABLE
        // unit of the line's item type. A concurrent checkout of the same unit waits here and
        // then changes 0 rows.
        assertTransition("UNIT", UnitStatus.AVAILABLE, UnitStatus.ON_LOAN);
        const movedUnit = await tx.unit.updateMany({
          where: { id: unitId, itemTypeId: line.itemTypeId, status: UnitStatus.AVAILABLE },
          data: { status: UnitStatus.ON_LOAN },
        });
        if (movedUnit.count === 0) {
          // itemTypeId never changes, so the step 5 read decides this (F03-D4: checked first).
          if (unit.itemTypeId !== line.itemTypeId)
            throw new ConflictError("UNIT_WRONG_ITEM_TYPE", `Unit ${unit.assetTag} is not a unit of ${line.itemType.name}.`, [
              { field: UNIT_FIELD, issue: `Unit belongs to item type ${unit.itemType.name}` },
            ]);
          // Fresh read: a concurrent checkout may have committed after step 5 (contract F-03 3.7).
          const current = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, select: { status: true } });
          throw unitNotAvailable(unit.assetTag, `Unit is ${current.status}`);
        }

        assertTransition("LOAN", null, LoanStatus.ACTIVE);
        let loanId: number;
        try {
          const loan = await tx.loan.create({
            data: {
              requestLineId: line.id,
              unitId,
              status: LoanStatus.ACTIVE,
              checkedOutAt: now,
              checkedOutById: user.id,
              dueAt: computeDueAt(now, line.itemType.maxLoanDays),
            },
            select: { id: true },
          });
          loanId = loan.id;
        } catch (err) {
          // Backstop: loans_one_active_per_unit (contract F-03 3.9).
          throw toLoanInsertConflict(err, unit);
        }

        // History in the same transaction; the actor is always the session user (contract F-03 3.10).
        const actor = { occurredAt: now, actorType: ActorType.USER, actorUserId: user.id, requestId };
        await tx.historyEntry.createMany({
          data: [
            {
              ...actor,
              entityType: HistoryEntity.REQUEST,
              action: "STATUS_CHANGED",
              fromStatus: RequestStatus.PENDING,
              toStatus: RequestStatus.CHECKED_OUT,
            },
            {
              ...actor,
              entityType: HistoryEntity.UNIT,
              unitId,
              action: "STATUS_CHANGED",
              fromStatus: UnitStatus.AVAILABLE,
              toStatus: UnitStatus.ON_LOAN,
            },
            {
              ...actor,
              entityType: HistoryEntity.LOAN,
              unitId,
              loanId,
              action: "CREATED",
              fromStatus: null,
              toStatus: LoanStatus.ACTIVE,
            },
          ],
        });
      });

      // The full request in the caller's detail shape, with the new loan (F03-D6).
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: requestSelect });
      return toRequestView(row, user.role);
    },
  };
}
