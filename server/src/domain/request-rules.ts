// Rules for creating a borrow request (contract F-02 3.2, 3.3; contract F-04 3.3, 3.5). Pure: the
// service reads the facts inside its transaction and asks this function which rule, if any, is
// broken, and on which lines. F-05 uses the same function for an edit (FR-11).

export type RequestRuleViolation = "DUPLICATE_OPEN_REQUEST" | "QUANTITY_LIMIT" | "LOAN_LENGTH_LIMIT" | "ITEM_TYPE_UNAVAILABLE";

export interface RequestLineFacts {
  /** The item type's name, for messages */
  name: string;
  quantity: number;
  maxQuantityPerRequest: number;
  maxLoanDays: number;
  /** Units of the item type in AVAILABLE (BR-01, A-04) */
  availableCount: number;
  /** The Borrower's open (PENDING or APPROVED) request with this item type, or null (BR-04) */
  openRequestId: number | null;
}

export interface RequestRuleFacts {
  /** In body order */
  lines: RequestLineFacts[];
  loanDays: number;
}

export interface RequestRuleResult {
  rule: RequestRuleViolation;
  /** Indexes of the lines that break the rule, in body order; for LOAN_LENGTH_LIMIT the line that sets the limit */
  lines: number[];
}

/** The smallest maxLoanDays among the lines and the first line that has it (BR-08). */
export function loanLengthLimit(lines: Pick<RequestLineFacts, "maxLoanDays">[]): { days: number; index: number } {
  let index = 0;
  lines.forEach((line, i) => {
    if (line.maxLoanDays < lines[index].maxLoanDays) index = i;
  });
  return { days: lines[index].maxLoanDays, index };
}

const failing = (lines: RequestLineFacts[], broken: (line: RequestLineFacts) => boolean) =>
  lines.flatMap((line, i) => (broken(line) ? [i] : []));

/**
 * The first broken rule in the order BR-04 → BR-07 → BR-08 → BR-01 (F04-D3, extends F02-D1), with
 * every line that breaks it; null when the request may be stored.
 */
export function requestRuleViolation({ lines, loanDays }: RequestRuleFacts): RequestRuleResult | null {
  const open = failing(lines, (l) => l.openRequestId !== null);
  if (open.length > 0) return { rule: "DUPLICATE_OPEN_REQUEST", lines: open };

  const tooMany = failing(lines, (l) => l.quantity > l.maxQuantityPerRequest);
  if (tooMany.length > 0) return { rule: "QUANTITY_LIMIT", lines: tooMany };

  const limit = loanLengthLimit(lines);
  if (loanDays > limit.days) return { rule: "LOAN_LENGTH_LIMIT", lines: [limit.index] };

  const short = failing(lines, (l) => l.availableCount < l.quantity);
  if (short.length > 0) return { rule: "ITEM_TYPE_UNAVAILABLE", lines: short };

  return null;
}
