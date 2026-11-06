// Requests used by the F-03 UI tests (contract F-03 5.1 and 5.3 examples).
import type { BorrowRequest } from "../src/api/requests";

/** Request #12 of Borrower One, PENDING, one line for Arduino Uno R3 (item type 3, line 5). */
export const pending12: BorrowRequest = {
  id: 12,
  status: "PENDING",
  createdAt: "2026-11-06T06:10:00.000Z",
  dueAt: null,
  borrower: { id: 3, username: "borrower1", displayName: "Borrower One" },
  lines: [{ id: 5, itemType: { id: 3, name: "Arduino Uno R3" }, quantity: 1, loans: [] }],
};

/** The 201 response of contract F-03 5.3: request #12 checked out with KH-ARD-0007. */
export const checkedOut12: BorrowRequest = {
  ...pending12,
  status: "CHECKED_OUT",
  dueAt: "2026-11-20T07:30:00.000Z",
  lines: [
    {
      ...pending12.lines[0],
      loans: [
        {
          id: 31,
          status: "ACTIVE",
          unit: { id: 7, assetTag: "KH-ARD-0007" },
          checkedOutAt: "2026-11-06T07:30:00.000Z",
          dueAt: "2026-11-20T07:30:00.000Z",
          checkedOutBy: { id: 1, username: "custodian1", displayName: "Custodian One" },
        },
      ],
    },
  ],
};
