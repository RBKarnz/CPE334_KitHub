// Checkout of a pending request (contract F-03 5.3). Stub for the failing UI tests of #19; implemented next.
import type { BorrowRequest } from "./requests";

export interface CheckoutBody {
  units: { lineId: number; unitId: number }[];
}

export const checkoutRequest = (_requestId: number, _body: CheckoutBody): Promise<BorrowRequest> =>
  Promise.reject(new Error("checkoutRequest is not implemented yet (#19)"));
