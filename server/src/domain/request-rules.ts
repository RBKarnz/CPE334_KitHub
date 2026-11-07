// Rules for creating a borrow request (contract F-02 3.2, 3.3). Pure: the service reads the
// facts inside its transaction and asks this function which rule, if any, is broken.

export type RequestRuleViolation = "DUPLICATE_OPEN_REQUEST" | "ITEM_TYPE_UNAVAILABLE";

export interface RequestRuleFacts {
  /** The Borrower already has an open (PENDING or APPROVED) request with this item type (BR-04) */
  hasOpenRequest: boolean;
  /** Units of the item type in AVAILABLE (BR-01, A-04) */
  availableCount: number;
  quantity: number;
}

/** BR-04 is checked before BR-01, so when both fail the result is DUPLICATE_OPEN_REQUEST (F02-D1). */
export function requestRuleViolation({ hasOpenRequest, availableCount, quantity }: RequestRuleFacts): RequestRuleViolation | null {
  if (hasOpenRequest) return "DUPLICATE_OPEN_REQUEST";
  if (availableCount < quantity) return "ITEM_TYPE_UNAVAILABLE";
  return null;
}
