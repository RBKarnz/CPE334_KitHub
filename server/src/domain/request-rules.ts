// Rules for creating a borrow request (contract F-02 3.2, 3.3; contract F-04 3.3, 3.5). Pure: the
// service reads the facts inside its transaction and asks this function which rule, if any, is
// broken, and on which lines. F-05 uses the same function for an edit (FR-11). F-11 adds the
// overdue block (BR-15) and the 5-unit limit (BR-14), and the overdue status itself (FR-22).

export type RequestRuleViolation =
  | "OVERDUE_BLOCK"
  | "DUPLICATE_OPEN_REQUEST"
  | "QUANTITY_LIMIT"
  | "LOAN_LENGTH_LIMIT"
  | "BORROW_LIMIT"
  | "ITEM_TYPE_UNAVAILABLE";

/** BR-14: a Borrower may hold at most this many units (contract F-11 F11-D6). */
export const BORROW_LIMIT_UNITS = 5;

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
  /** The Borrower's overdue requests, oldest due first (BR-15, F-11); absent before F-11 */
  overdueRequestIds?: number[];
  /** Units the Borrower holds, the edited request left out (BR-14, D-20, F-11 3.4); absent before F-11 */
  heldUnits?: number;
}

export interface RequestRuleResult {
  rule: RequestRuleViolation;
  /** Indexes of the lines that break the rule, in body order; for LOAN_LENGTH_LIMIT the line that sets the limit */
  lines: number[];
}

/** A request is overdue when it is CHECKED_OUT with an ACTIVE loan past its dueAt; not at dueAt exactly (F11-D1, F11-D2). */
export function isOverdue(
  request: { status: string; lines: { loans: { status: string; dueAt: Date }[] }[] },
  now: Date,
): boolean {
  return (
    request.status === "CHECKED_OUT" &&
    request.lines.some((line) => line.loans.some((loan) => loan.status === "ACTIVE" && loan.dueAt.getTime() < now.getTime()))
  );
}

/** The earliest dueAt among a request's ACTIVE loans, for the overdue order (F11-D8). */
export function earliestActiveDue(request: { lines: { loans: { status: string; dueAt: Date }[] }[] }): number {
  const due = request.lines.flatMap((line) => line.loans.filter((loan) => loan.status === "ACTIVE").map((loan) => loan.dueAt.getTime()));
  return due.length > 0 ? Math.min(...due) : Number.POSITIVE_INFINITY;
}

/** BR-14: null when held + asked fits the limit (exactly 5 is allowed), else both numbers (F11-D5). */
export function borrowLimitViolation(held: number, asked: number): { held: number; asked: number } | null {
  return held + asked > BORROW_LIMIT_UNITS ? { held, asked } : null;
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
 * The first broken rule in the order BR-15 → BR-04 → BR-07 → BR-08 → BR-14 → BR-01 (contract F-11
 * 3.5, extends F04-D3 and F02-D1), with every line that breaks it; null when the request may be
 * stored. BR-15 and BR-14 concern the whole request, so their `lines` is empty.
 */
export function requestRuleViolation({ lines, loanDays, overdueRequestIds, heldUnits }: RequestRuleFacts): RequestRuleResult | null {
  if (overdueRequestIds && overdueRequestIds.length > 0) return { rule: "OVERDUE_BLOCK", lines: [] };

  const open = failing(lines, (l) => l.openRequestId !== null);
  if (open.length > 0) return { rule: "DUPLICATE_OPEN_REQUEST", lines: open };

  const tooMany = failing(lines, (l) => l.quantity > l.maxQuantityPerRequest);
  if (tooMany.length > 0) return { rule: "QUANTITY_LIMIT", lines: tooMany };

  const limit = loanLengthLimit(lines);
  if (loanDays > limit.days) return { rule: "LOAN_LENGTH_LIMIT", lines: [limit.index] };

  const asked = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (heldUnits !== undefined && borrowLimitViolation(heldUnits, asked)) return { rule: "BORROW_LIMIT", lines: [] };

  const short = failing(lines, (l) => l.availableCount < l.quantity);
  if (short.length > 0) return { rule: "ITEM_TYPE_UNAVAILABLE", lines: short };

  return null;
}
