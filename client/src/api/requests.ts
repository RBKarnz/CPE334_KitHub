import { apiFetch } from "./client";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "CHECKED_OUT" | "RETURNED" | "EXPIRED";

export interface UserSummary {
  id: number;
  username: string;
  displayName: string;
}

/** A loan on a request line, filled by F-03 (contract F-03 F03-D7). */
export interface LineLoan {
  id: number;
  status: "ACTIVE" | "RETURNED";
  unit: { id: number; assetTag: string };
  checkedOutAt: string;
  dueAt: string;
  checkedOutBy?: UserSummary;
  /** F-08 5.3: null while ACTIVE; returnedBy in the Custodian view only. */
  returnedAt?: string | null;
  returnCondition?: "GOOD" | "DAMAGED" | null;
  returnedBy?: UserSummary | null;
}

/** One history entry of the Custodian detail (contract F-06 F06-D5). `actor` null is the System. */
export interface HistoryItem {
  id: number;
  occurredAt: string;
  actor: UserSummary | null;
  entityType: "REQUEST" | "UNIT" | "LOAN";
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: { reason?: string } | null;
}

/** The request representation of contract F-02 section 4.5, with the F-06 decision fields (F06-D4). */
export interface BorrowRequest {
  id: number;
  status: RequestStatus;
  createdAt: string;
  loanDays?: number | null;
  decidedAt?: string | null;
  /** Custodian view only (F06-D4). */
  decidedBy?: UserSummary | null;
  rejectionReason?: string | null;
  /** Custodian detail only (F06-D5). */
  history?: HistoryItem[];
  dueAt: string | null;
  borrower: UserSummary;
  lines: { id: number; itemType: { id: number; name: string }; quantity: number; loans: LineLoan[] }[];
}

/** The create body of contract F-04 5.2: 1 to 10 lines and one loan length for the request. */
export interface RequestInput {
  lines: { itemTypeId: number; quantity: number }[];
  loanDays: number;
}

export const createRequest = (body: RequestInput) => apiFetch<BorrowRequest>("/requests", { method: "POST", body });

export const fetchMyRequests = () => apiFetch<{ items: BorrowRequest[] }>("/requests").then((r) => r.items);

export const fetchRequest = (id: number) => apiFetch<BorrowRequest>(`/requests/${id}`);

/** Custodian: every request, oldest first, or only those in `status` (contract F-06 4.2, F06-D7). */
export const fetchRequests = (status?: RequestStatus) =>
  apiFetch<{ items: BorrowRequest[] }>(`/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`).then(
    (r) => r.items,
  );

/** Custodian: approve a PENDING request as a whole (contract F-06 5.1). */
export const approveRequest = (id: number) =>
  apiFetch<BorrowRequest>(`/requests/${id}/approve`, { method: "POST", body: {} });

/** Custodian: reject a PENDING request with a reason the Borrower sees (contract F-06 5.2). */
export const rejectRequest = (id: number, reason: string) =>
  apiFetch<BorrowRequest>(`/requests/${id}/reject`, { method: "POST", body: { reason } });

/** Custodian: APPROVED requests, oldest first, for Ready for checkout (contract F-07 4, F07-D6). */
export const fetchApprovedRequests = () =>
  apiFetch<{ items: BorrowRequest[] }>("/requests?status=APPROVED").then((r) => r.items);

/** Custodian: every Borrower's PENDING requests, oldest first (contract F-03 5.1, F03-D2). */
export const fetchPendingRequests = () =>
  apiFetch<{ items: BorrowRequest[] }>("/requests?status=PENDING").then((r) => r.items);
