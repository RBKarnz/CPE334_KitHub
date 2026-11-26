// Unit parts of TEST-10, TEST-11 and TEST-38 (contract F-02 8.1) and of TEST-66, TEST-67 and
// TEST-69 (contract F-04 8.2): the request creation rules over every line and the loan length.
// F-04 (4.1) changes requestRuleViolation to take every line and the loan length and to return the
// first broken rule with the lines that break it. The Sprint 1 cases keep their rules (F04-D9).
// The function is reached through a typed view, so this file typechecks before and after F-04.
import { describe, expect, it } from "vitest";
import * as rules from "../../src/domain/request-rules.js";

interface Line {
  name: string;
  quantity: number;
  maxQuantityPerRequest: number;
  maxLoanDays: number;
  availableCount: number;
  /** The Borrower's open request with this item type (BR-04), or null */
  openRequestId: number | null;
}
interface Result {
  rule: "DUPLICATE_OPEN_REQUEST" | "QUANTITY_LIMIT" | "LOAN_LENGTH_LIMIT" | "ITEM_TYPE_UNAVAILABLE";
  /** Indexes of the lines that break the rule, in body order */
  lines: number[];
}

const check = rules.requestRuleViolation as unknown as (facts: { lines: Line[]; loanDays: number }) => Result | null;
const loanLengthLimit = (rules as unknown as { loanLengthLimit?: (lines: Line[]) => { days: number; index: number } })
  .loanLengthLimit;

const line = (over: Partial<Line> = {}): Line => ({
  name: "Arduino Uno R3",
  quantity: 1,
  maxQuantityPerRequest: 2,
  maxLoanDays: 14,
  availableCount: 3,
  openRequestId: null,
  ...over,
});
const multimeter = (over: Partial<Line> = {}) => line({ name: "Digital multimeter", maxQuantityPerRequest: 1, maxLoanDays: 3, ...over });

describe("requestRuleViolation (BR-01, BR-04, BR-07, BR-08; F02-D1, F04-D3)", () => {
  it("TEST-10 (unit): 0 available gives ITEM_TYPE_UNAVAILABLE, 1 available gives none", () => {
    expect(check({ lines: [line({ availableCount: 0 })], loanDays: 7 })).toEqual({ rule: "ITEM_TYPE_UNAVAILABLE", lines: [0] });
    expect(check({ lines: [line({ availableCount: 1 })], loanDays: 7 })).toBeNull();
  });

  it("TEST-11 (unit): an open request gives DUPLICATE_OPEN_REQUEST; none gives no violation", () => {
    expect(check({ lines: [line({ openRequestId: 12 })], loanDays: 7 })).toEqual({ rule: "DUPLICATE_OPEN_REQUEST", lines: [0] });
    expect(check({ lines: [line()], loanDays: 7 })).toBeNull();
  });

  it("TEST-38 (unit): when BR-04 and BR-01 both fail, DUPLICATE_OPEN_REQUEST wins (F02-D1)", () => {
    expect(check({ lines: [line({ openRequestId: 12, availableCount: 0 })], loanDays: 7 })?.rule).toBe("DUPLICATE_OPEN_REQUEST");
  });

  it("fewer available units than the quantity is ITEM_TYPE_UNAVAILABLE on that line", () => {
    expect(check({ lines: [line(), line({ name: "ESP32", quantity: 2, availableCount: 1 })], loanDays: 7 })).toEqual({
      rule: "ITEM_TYPE_UNAVAILABLE",
      lines: [1],
    });
  });

  it("TEST-66 (unit): a quantity equal to the maximum is allowed; one above is QUANTITY_LIMIT", () => {
    expect(check({ lines: [line({ quantity: 2 })], loanDays: 7 })).toBeNull();
    expect(check({ lines: [line({ quantity: 3 })], loanDays: 7 })).toEqual({ rule: "QUANTITY_LIMIT", lines: [0] });
    expect(check({ lines: [multimeter({ quantity: 2 }), line({ quantity: 3 })], loanDays: 3 })).toEqual({
      rule: "QUANTITY_LIMIT",
      lines: [0, 1],
    });
  });

  it("TEST-67 (unit): the smallest maximum of 14, 3, 14 is 3, set by the multimeter (index 1)", () => {
    const lines = [line(), multimeter(), line({ name: "HC-SR04" })];
    expect(loanLengthLimit).toBeTypeOf("function");
    expect(loanLengthLimit!(lines)).toEqual({ days: 3, index: 1 });
    expect(check({ lines, loanDays: 3 })).toBeNull();
    expect(check({ lines, loanDays: 4 })).toEqual({ rule: "LOAN_LENGTH_LIMIT", lines: [1] });
  });

  it("TEST-69 (e) (unit): BR-07, BR-08 and BR-01 fail: QUANTITY_LIMIT", () => {
    expect(check({ lines: [multimeter({ quantity: 2, availableCount: 0 })], loanDays: 14 })?.rule).toBe("QUANTITY_LIMIT");
  });

  it("TEST-69 (f) (unit): BR-08 and BR-01 fail: LOAN_LENGTH_LIMIT", () => {
    expect(check({ lines: [multimeter({ availableCount: 0 })], loanDays: 14 })?.rule).toBe("LOAN_LENGTH_LIMIT");
  });
});
