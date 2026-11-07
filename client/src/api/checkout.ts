// Checkout of a pending request (contract F-03 5.3). Custodian only.
import { apiFetch } from "./client";
import type { BorrowRequest } from "./requests";

/** Exactly one entry in Sprint 1; the array is for Sprint 2 (DD-11). */
export interface CheckoutBody {
  units: { lineId: number; unitId: number }[];
}

/** 201 with the request, now CHECKED_OUT, with its new loan under the line (F03-D6). */
export const checkoutRequest = (requestId: number, body: CheckoutBody) =>
  apiFetch<BorrowRequest>(`/requests/${requestId}/checkout`, { method: "POST", body });
