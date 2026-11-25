// Loans, scoped by role: a Borrower's own, or every loan for a Custodian (contract F-07 5.2, F07-D5).
import { apiFetch } from "./client";
import type { UserSummary } from "./requests";

export type LoanListStatus = "ACTIVE" | "RETURNED";

export interface LoanItem {
  id: number;
  status: LoanListStatus;
  checkedOutAt: string;
  dueAt: string;
  returnedAt: string | null;
  unit: { id: number; assetTag: string };
  itemType: { id: number; name: string };
  request: { id: number };
  /** Custodian view only. */
  borrower?: UserSummary;
}

/** Earliest due first. Without `status` the API lists ACTIVE loans. */
export const fetchLoans = (status?: LoanListStatus) =>
  apiFetch<{ items: LoanItem[] }>(`/loans${status ? `?status=${status}` : ""}`).then((r) => r.items);
