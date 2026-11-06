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
}

/** The request representation of contract F-02 section 4.5. */
export interface BorrowRequest {
  id: number;
  status: RequestStatus;
  createdAt: string;
  dueAt: string | null;
  borrower: UserSummary;
  lines: { id: number; itemType: { id: number; name: string }; quantity: number; loans: LineLoan[] }[];
}

export const createRequest = (itemTypeId: number) =>
  apiFetch<BorrowRequest>("/requests", { method: "POST", body: { lines: [{ itemTypeId, quantity: 1 }] } });

export const fetchMyRequests = () => apiFetch<{ items: BorrowRequest[] }>("/requests").then((r) => r.items);

export const fetchRequest = (id: number) => apiFetch<BorrowRequest>(`/requests/${id}`);

/** Stub for the failing UI tests of #19; implemented next. */
export const fetchPendingRequests = (): Promise<BorrowRequest[]> =>
  Promise.reject(new Error("fetchPendingRequests is not implemented yet (#19)"));
