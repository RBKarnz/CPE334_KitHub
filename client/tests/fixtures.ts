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

/** The 201 response of contract F-03 5.3: request #12 checked out with KH-ARD-0007, due 17:00 ICT (D-21, #71). */
export const checkedOut12: BorrowRequest = {
  ...pending12,
  status: "CHECKED_OUT",
  dueAt: "2026-11-20T10:00:00.000Z",
  lines: [
    {
      ...pending12.lines[0],
      loans: [
        {
          id: 31,
          status: "ACTIVE",
          unit: { id: 7, assetTag: "KH-ARD-0007" },
          checkedOutAt: "2026-11-06T07:30:00.000Z",
          dueAt: "2026-11-20T10:00:00.000Z",
          checkedOutBy: { id: 1, username: "custodian1", displayName: "Custodian One" },
        },
      ],
    },
  ],
};

/** F-07: request #12 approved, without a loan length (a Sprint 1 request approved in Sprint 2, F07-D3). */
export const approved12: BorrowRequest = {
  ...pending12,
  status: "APPROVED",
  loanDays: null,
  decidedAt: "2026-11-06T07:00:00.000Z",
  decidedBy: { id: 1, username: "custodian1", displayName: "Custodian One" },
  rejectionReason: null,
};

/** F-07 contract 5.1: request #12 approved for 7 days, line 5 Arduino Uno R3 × 2, line 6 HC-SR04 × 1. */
export const approvedMulti12: BorrowRequest = {
  ...approved12,
  loanDays: 7,
  lines: [
    { id: 5, itemType: { id: 3, name: "Arduino Uno R3" }, quantity: 2, loans: [] },
    { id: 6, itemType: { id: 4, name: "HC-SR04 ultrasonic sensor" }, quantity: 1, loans: [] },
  ],
};

const loanOf = (id: number, unitId: number, assetTag: string) => ({
  id,
  status: "ACTIVE" as const,
  unit: { id: unitId, assetTag },
  checkedOutAt: "2026-11-30T03:00:00.000Z",
  dueAt: "2026-12-07T10:00:00.000Z",
  checkedOutBy: { id: 1, username: "custodian1", displayName: "Custodian One" },
});

/** The 201 response of F-07 5.1 for approvedMulti12: three loans due Mon 7 Dec 2026, 17:00 ICT. */
export const checkedOutMulti12: BorrowRequest = {
  ...approvedMulti12,
  status: "CHECKED_OUT",
  dueAt: "2026-12-07T10:00:00.000Z",
  lines: [
    { ...approvedMulti12.lines[0], loans: [loanOf(31, 1, "KH-ARD-0001"), loanOf(32, 2, "KH-ARD-0002")] },
    { ...approvedMulti12.lines[1], loans: [loanOf(33, 23, "KH-SR04-0003")] },
  ],
};
