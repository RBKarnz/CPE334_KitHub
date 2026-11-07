// The request representation shared by every endpoint that returns a request (contract F-02
// 4.5). Fields are selected explicitly, so no raw column or password hash can leak (SDS 6.3).
import { Role, type Prisma } from "@prisma/client";

const userSummary = { select: { id: true, username: true, displayName: true } } as const;

export const requestSelect = {
  id: true,
  status: true,
  createdAt: true,
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
          unit: { select: { id: true, assetTag: true } },
          checkedOutBy: userSummary,
        },
      },
    },
  },
} satisfies Prisma.BorrowRequestSelect;

export type RequestRow = Prisma.BorrowRequestGetPayload<{ select: typeof requestSelect }>;

/** Shapes a request for the caller. A Borrower does not see who checked a loan out (F03-D7). */
export function toRequestView(row: RequestRow, viewerRole: Role) {
  const lines = row.lines.map((line) => ({
    id: line.id,
    itemType: line.itemType,
    quantity: line.quantity,
    loans: line.loans.map(({ checkedOutBy, ...loan }) =>
      viewerRole === Role.CUSTODIAN ? { ...loan, checkedOutBy } : loan,
    ),
  }));
  // Every loan of a request shares one dueAt (SDS 4.5); null until F-03 creates loans.
  const dueAt = row.lines.flatMap((line) => line.loans)[0]?.dueAt ?? null;
  return { id: row.id, status: row.status, createdAt: row.createdAt, dueAt, borrower: row.borrower, lines };
}
