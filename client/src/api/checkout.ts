// Checkout of an approved request (contract F-07 5.1). Custodian only.
import { apiFetch } from "./client";
import type { BorrowRequest } from "./requests";

/** One entry per unit: each line gets exactly its quantity (contract F-07 3.4). */
export interface CheckoutBody {
  units: { lineId: number; unitId: number }[];
}

/** 201 with the request, now CHECKED_OUT, with its new loans under their lines (F-07 5.1). */
export const checkoutRequest = (requestId: number, body: CheckoutBody) =>
  apiFetch<BorrowRequest>(`/requests/${requestId}/checkout`, { method: "POST", body });
