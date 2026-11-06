// Checkout dialog (contract F-03 4.3). Stub for the failing UI tests of #19; implemented next.
import type { BorrowRequest } from "../../api/requests";

export interface CheckoutDialogProps {
  request: BorrowRequest;
  onClose: () => void;
  onCheckedOut: (request: BorrowRequest) => void;
  onStale: () => void;
}

export function CheckoutDialog(_props: CheckoutDialogProps) {
  return null;
}
