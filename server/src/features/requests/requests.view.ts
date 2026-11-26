// The request representation shared by every endpoint that returns a request (contract F-02
// 4.5). Fields are selected explicitly, so no raw column or password hash can leak (SDS 6.3).
import { Role, type Prisma } from "@prisma/client";

const userSummary = { select: { id: true, username: true, displayName: true } } as const;

export const requestSelect = {
  id: true,
  status: true,
  createdAt: true,
  // Sprint 2 decision fields (contract F-06 F06-D4).
  loanDays: true,
  decidedAt: true,
  rejectionReason: true,
  decidedBy: userSummary,
  borrower: userSummary,
  lines: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      quantity: true,
      itemType: { select: { id: true, name: true } },
      loans: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          checkedOutAt: true,
          dueAt: true,
          // F-08 5.3: null while ACTIVE; returnedBy is in the Custodian view only.
          returnedAt: true,
          returnCondition: true,
          unit: { select: { id: true, assetTag: true } },
          checkedOutBy: userSummary,
          returnedBy: userSummary,
        },
      },
    },
  },
} satisfies Prisma.BorrowRequestSelect;

export type RequestRow = Prisma.BorrowRequestGetPayload<{ select: typeof requestSelect }>;

/**
 * Shapes a request for the caller. A Borrower does not see which Custodian checked a loan out
 * (F03-D7) or decided the request (F06-D4); both roles see the decision time and the reason.
 */
export function toRequestView(row: RequestRow, viewerRole: Role) {
  const lines = row.lines.map((line) => ({
    id: line.id,
    itemType: line.itemType,
    quantity: line.quantity,
    loans: line.loans.map(({ checkedOutBy, returnedBy, ...loan }) =>
      viewerRole === Role.CUSTODIAN ? { ...loan, checkedOutBy, returnedBy } : loan,
    ),
  }));
  // Every loan of a request shares one dueAt (SDS 4.5); null until F-03 creates loans.
  const dueAt = row.lines.flatMap((line) => line.loans)[0]?.dueAt ?? null;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    loanDays: row.loanDays,
    decidedAt: row.decidedAt,
    ...(viewerRole === Role.CUSTODIAN ? { decidedBy: row.decidedBy } : {}),
    rejectionReason: row.rejectionReason,
    dueAt,
    borrower: row.borrower,
    lines,
  };
}

/** History items of the Custodian detail (F06-D5): no IDs of other tables, users as summaries. */
export const historySelect = {
  id: true,
  occurredAt: true,
  actorUser: userSummary,
  entityType: true,
  action: true,
  fromStatus: true,
  toStatus: true,
  details: true,
} satisfies Prisma.HistoryEntrySelect;

export type HistoryRow = Prisma.HistoryEntryGetPayload<{ select: typeof historySelect }>;

/** `actor` is null for the System actor (SDS 4.6). */
export const toHistoryView = ({ actorUser, ...entry }: HistoryRow) => ({
  id: entry.id,
  occurredAt: entry.occurredAt,
  actor: actorUser,
  entityType: entry.entityType,
  action: entry.action,
  fromStatus: entry.fromStatus,
  toStatus: entry.toStatus,
  details: entry.details,
});
