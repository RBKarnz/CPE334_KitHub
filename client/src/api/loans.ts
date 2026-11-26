// Loans, scoped by role: a Borrower's own, or every loan for a Custodian (contract F-07 5.2, F07-D5).
import { apiFetch } from "./client";
import type { BorrowRequest, UserSummary } from "./requests";

export type LoanListStatus = "ACTIVE" | "RETURNED";
export type ReturnConditionValue = "GOOD" | "DAMAGED";

export interface LoanItem {
  id: number;
  status: LoanListStatus;
  checkedOutAt: string;
  dueAt: string;
  returnedAt: string | null;
  returnCondition?: ReturnConditionValue | null;
  unit: { id: number; assetTag: string };
  itemType: { id: number; name: string };
  request: { id: number };
  /** Custodian view only. */
  borrower?: UserSummary;
}

/** Earliest due first. Without `status` the API lists ACTIVE loans. */
export const fetchLoans = (status?: LoanListStatus) =>
  apiFetch<{ items: LoanItem[] }>(`/loans${status ? `?status=${status}` : ""}`).then((r) => r.items);

/** Custodian: return every ACTIVE loan of a CHECKED_OUT request (contract F-08 5.1). */
export const returnRequest = (requestId: number, loans: { loanId: number; condition: ReturnConditionValue }[]) =>
  apiFetch<BorrowRequest>(`/requests/${requestId}/return`, { method: "POST", body: { loans } });

/** Custodian: early return of one loan (contract F-08 5.2). */
export const returnLoan = (loanId: number, condition: ReturnConditionValue) =>
  apiFetch<BorrowRequest>(`/loans/${loanId}/return`, { method: "POST", body: { condition } });
